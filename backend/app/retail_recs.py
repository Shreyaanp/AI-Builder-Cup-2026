"""Recommendations AI (Vertex AI Search for commerce): catalog shaping, user events, serving.

Three parts, all REST over the default Google credentials (no extra client library):

- Catalog: every shared shop's items become Retail products (`catalog_products`).
- Events: real customer actions only, batched, with a hashed anonymous visitor id and no personal
  data (`EventPipeline`). Nothing is ever backfilled or invented.
- Serving: `similar_items(product_id)` asks the "Similar items" model when the switch is on and the
  model is serving; otherwise, and on any error, it returns None so callers use embeddings.
"""

from __future__ import annotations

import hashlib
import re
import threading
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
import structlog

from .money import to_major

log = structlog.get_logger()

API = "https://retail.googleapis.com/v2"
CATALOG = "default_catalog"
BRANCH = "default_branch"
MODEL_ID = "similar_items"
SERVING_CONFIG_ID = "similar_items_default"
# Retail import accepts at most 100 products per inline request.
IMPORT_BATCH = 100
EVENT_BATCH = 50
EVENT_FLUSH_SECONDS = 30.0
MAX_BUFFER = 2_000
READY_CACHE_SECONDS = 600.0
QUERY_CHARS = 80


def catalog_path(project: str) -> str:
    return f"projects/{project}/locations/global/catalogs/{CATALOG}"


def product_id(shop_id: str, name: str, unit: str) -> str:
    """Stable Retail ID for one shop item (<=128 chars of [A-Za-z0-9_-]).

    Shops name items by (name, unit), so the same pair always maps to the same product; the
    frontend and event mapping use this same function via the API.
    """
    shop = re.sub(r"[^A-Za-z0-9_-]", "-", shop_id)[:80]
    key = hashlib.sha256(f"{name}\0{unit}".encode()).hexdigest()[:20]
    return f"{shop}--{key}"


def _category(text: str) -> str:
    # ">" is the Retail hierarchy separator; keep owner text from creating fake levels.
    return re.sub(r"\s+", " ", text.replace(">", " ")).strip()[:200]


def shape_product(shop: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    """One public shop item as a Retail product. Only customer-visible fields are sent."""
    currency = (shop.get("currency") or "SGD").upper()
    shop_category = _category(shop.get("category") or "") or "Shop"
    item_category = _category(item.get("category") or "")
    categories = [f"{shop_category} > {item_category}" if item_category else shop_category]
    attributes: dict[str, Any] = {
        "shop_id": {"text": [shop["id"][:256]]},
        "unit": {"text": [str(item.get("unit") or "item")[:256]]},
        "demo": {"text": ["true" if shop.get("demo") else "false"]},
    }
    if isinstance(shop.get("lat"), int | float) and isinstance(shop.get("lng"), int | float):
        attributes["lat"] = {"numbers": [round(float(shop["lat"]), 4)]}
        attributes["lng"] = {"numbers": [round(float(shop["lng"]), 4)]}
    return {
        "id": product_id(shop["id"], item["name"], item.get("unit") or "item"),
        "type": "PRIMARY",
        "title": str(item["name"])[:1000],
        "categories": categories,
        "brands": [str(shop.get("name") or "")[:1000]] if shop.get("name") else [],
        "priceInfo": {
            "price": to_major(int(item.get("price") or 0), currency),
            "currencyCode": currency,
        },
        "availability": "IN_STOCK" if item.get("available", True) else "OUT_OF_STOCK",
        "attributes": attributes,
    }


def catalog_products(shops: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """All items of all shared shops; duplicates (same name and unit) keep the first."""
    products: dict[str, dict[str, Any]] = {}
    for shop in shops:
        for item in shop.get("products") or []:
            if not item.get("name"):
                continue
            product = shape_product(shop, item)
            products.setdefault(product["id"], product)
    return list(products.values())


# --- privacy -------------------------------------------------------------------------------

_EMAIL = re.compile(r"\S+@\S+")
_DIGITS = re.compile(r"\+?\d[\d\s().-]{5,}\d")
_VISITOR = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def visitor_key(anonymous_id: str) -> str | None:
    """Pseudonymous visitor id from the app's anonymous device id; never the raw value."""
    if not _VISITOR.fullmatch(anonymous_id or ""):
        return None
    return hashlib.sha256(f"chalkboard-recs\0{anonymous_id}".encode()).hexdigest()[:32]


def scrub_query(text: str) -> str:
    """Drop emails and phone-like numbers, collapse spaces and cap the length."""
    text = _DIGITS.sub(" ", _EMAIL.sub(" ", text or ""))
    return re.sub(r"\s+", " ", text).strip()[:QUERY_CHARS]


@dataclass(frozen=True)
class AppEvent:
    """A real customer action in the app, before mapping to a Retail user event."""

    kind: Literal["item_open", "shop_open", "ask", "remind", "follow", "ask_owner"]
    anonymous_id: str
    shop_id: str = ""
    category: str = ""
    item: tuple[str, str] | None = None  # (name, unit)
    query: str = ""
    at: float = field(default_factory=time.time)


def map_event(event: AppEvent) -> dict[str, Any] | None:
    """Retail user event for one app action, or None when it cannot be sent safely."""
    visitor = visitor_key(event.anonymous_id)
    if not visitor:
        return None
    when = datetime.fromtimestamp(event.at, UTC).isoformat().replace("+00:00", "Z")
    base: dict[str, Any] = {"visitorId": visitor, "eventTime": when}
    product = (
        [{"product": {"id": product_id(event.shop_id, *event.item)}}]
        if event.item and event.shop_id
        else []
    )
    match event.kind:
        case "item_open":
            return (
                {**base, "eventType": "detail-page-view", "productDetails": product}
                if product
                else None
            )
        case "shop_open":
            category = _category(event.category)
            return (
                {**base, "eventType": "category-page-view", "pageCategories": [category]}
                if category
                else None
            )
        case "ask":
            query = scrub_query(event.query)
            return {**base, "eventType": "search", "searchQuery": query} if query else None
        case "remind" | "follow" | "ask_owner":
            # Interest in a specific item. Shop-level follows and chats carry no item, so they
            # are not sent. Verified stamps are not item purchases either, so this pipeline
            # never sends purchase-complete (it would need an invented product and revenue).
            return (
                {**base, "eventType": "add-to-cart", "productDetails": product} if product else None
            )
    return None


# --- REST client ---------------------------------------------------------------------------

TokenSource = Callable[[], str]


def default_token() -> str:
    import google.auth
    import google.auth.transport.requests

    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    credentials.refresh(google.auth.transport.requests.Request())
    return str(credentials.token)


class RetailClient:
    def __init__(
        self,
        project: str,
        token: TokenSource = default_token,
        http: httpx.Client | None = None,
    ) -> None:
        self.project = project
        self.catalog = catalog_path(project)
        self._token = token
        self._http = http or httpx.Client(timeout=10.0)

    def call(
        self, method: str, path: str, body: dict[str, Any] | None = None, **params: Any
    ) -> Any:
        response = self._http.request(
            method,
            f"{API}/{path}",
            json=body,
            params=params or None,
            headers={
                "Authorization": f"Bearer {self._token()}",
                "X-Goog-User-Project": self.project,
            },
        )
        response.raise_for_status()
        return response.json() if response.content else {}

    def import_products(self, products: list[dict[str, Any]]) -> list[str]:
        """Incremental inline import in batches; returns the long-running operation names."""
        operations = []
        for start in range(0, len(products), IMPORT_BATCH):
            body = {
                "inputConfig": {
                    "productInlineSource": {"products": products[start : start + IMPORT_BATCH]}
                },
                "reconciliationMode": "INCREMENTAL",
            }
            result = self.call("POST", f"{self.catalog}/branches/{BRANCH}/products:import", body)
            operations.append(result.get("name", ""))
        return operations

    def operation(self, name: str) -> dict[str, Any]:
        return dict(self.call("GET", name))

    def list_product_ids(self) -> list[str]:
        ids: list[str] = []
        token = ""
        while True:
            params: dict[str, Any] = {"pageSize": 1000, "readMask": "id"}
            if token:
                params["pageToken"] = token
            page = self.call("GET", f"{self.catalog}/branches/{BRANCH}/products", **params)
            ids += [p["id"] for p in page.get("products", [])]
            token = page.get("nextPageToken", "")
            if not token:
                return ids

    def delete_product(self, pid: str) -> None:
        self.call("DELETE", f"{self.catalog}/branches/{BRANCH}/products/{pid}")

    def model(self, model_id: str = MODEL_ID) -> dict[str, Any] | None:
        try:
            return dict(self.call("GET", f"{self.catalog}/models/{model_id}"))
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 404:
                return None
            raise

    def create_similar_items_model(self) -> dict[str, Any]:
        """ "Similar items" trains on the catalog alone (no events needed). It takes no
        optimization objective (the API rejects "ctr" for this type); the ID comes from `name`."""
        body = {
            "name": f"{self.catalog}/models/{MODEL_ID}",
            "displayName": "Similar items",
            "type": "similar-items",
            "filteringOption": "RECOMMENDATIONS_FILTERING_ENABLED",
        }
        return dict(self.call("POST", f"{self.catalog}/models", body))

    def ensure_serving_config(self) -> dict[str, Any]:
        path = f"{self.catalog}/servingConfigs/{SERVING_CONFIG_ID}"
        try:
            return dict(self.call("GET", path))
        except httpx.HTTPStatusError as error:
            if error.response.status_code != 404:
                raise
        body = {
            "displayName": "Similar items",
            "modelId": MODEL_ID,
            "solutionTypes": ["SOLUTION_TYPE_RECOMMENDATION"],
        }
        return dict(
            self.call(
                "POST", f"{self.catalog}/servingConfigs", body, servingConfigId=SERVING_CONFIG_ID
            )
        )

    def write_events(self, events: list[dict[str, Any]]) -> None:
        body = {"inputConfig": {"userEventInlineSource": {"userEvents": events}}}
        self.call("POST", f"{self.catalog}/userEvents:import", body)

    def predict(self, product: str, visitor: str, page_size: int) -> list[str]:
        body = {
            "userEvent": {
                "eventType": "detail-page-view",
                "visitorId": visitor,
                "productDetails": [{"product": {"id": product}}],
            },
            "pageSize": page_size,
            "params": {"returnProduct": False},
        }
        result = self.call(
            "POST", f"{self.catalog}/servingConfigs/{SERVING_CONFIG_ID}:predict", body
        )
        return [row["id"] for row in result.get("results", []) if row.get("id") != product]


# --- serving -------------------------------------------------------------------------------


class Recommender:
    """Switchable "Similar items" lookup. Any failure means None (caller falls back)."""

    def __init__(self, client: RetailClient | None, enabled: bool) -> None:
        self.client = client
        self.enabled = enabled and client is not None
        self._ready_until = 0.0
        self._ready = False
        self._lock = threading.Lock()

    def ready(self) -> bool:
        if not self.enabled or self.client is None:
            return False
        with self._lock:
            if time.monotonic() < self._ready_until:
                return self._ready
        try:
            model = self.client.model() or {}
            ready = model.get("servingState") == "ACTIVE" and model.get("trainingState") != "PAUSED"
        except Exception:
            log.warning("recs_model_check_failed", exc_info=True)
            ready = False
        with self._lock:
            self._ready = ready
            self._ready_until = time.monotonic() + READY_CACHE_SECONDS
        return ready

    def similar_items(
        self, product: str, visitor: str = "", page_size: int = 6
    ) -> list[str] | None:
        if not self.ready() or self.client is None:
            return None
        try:
            return self.client.predict(product, visitor_key(visitor) or "anonymous", page_size)
        except Exception:
            log.warning("recs_predict_failed", exc_info=True)
            return None


_recommender: Recommender | None = None


def configure_recommender(recommender: Recommender | None) -> None:
    global _recommender
    _recommender = recommender


def similar_items(product: str, visitor: str = "", page_size: int = 6) -> list[str] | None:
    """Module-level hook for the search engine: product IDs, or None to use embeddings."""
    return _recommender.similar_items(product, visitor, page_size) if _recommender else None


# --- events --------------------------------------------------------------------------------


class EventPipeline:
    """Small in-memory batcher. Off by default; drops (never retries forever) on errors."""

    def __init__(
        self,
        client: RetailClient | None,
        enabled: bool,
        batch: int = EVENT_BATCH,
        interval: float = EVENT_FLUSH_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.client = client
        self.enabled = enabled and client is not None
        self.batch = batch
        self.interval = interval
        self.clock = clock
        self._buffer: list[dict[str, Any]] = []
        self._last = clock()
        self._lock = threading.Lock()

    def record(self, event: AppEvent) -> bool:
        """Queue one real event; returns True when it was accepted."""
        if not self.enabled:
            return False
        mapped = map_event(event)
        if mapped is None:
            return False
        with self._lock:
            if len(self._buffer) >= MAX_BUFFER:
                return False
            self._buffer.append(mapped)
        return True

    def due(self) -> bool:
        with self._lock:
            return bool(self._buffer) and (
                len(self._buffer) >= self.batch or self.clock() - self._last >= self.interval
            )

    def flush(self) -> int:
        with self._lock:
            events, self._buffer = self._buffer, []
            self._last = self.clock()
        if not events or self.client is None:
            return 0
        try:
            for start in range(0, len(events), 1_000):
                self.client.write_events(events[start : start + 1_000])
        except Exception:
            log.warning("recs_events_dropped", count=len(events), exc_info=True)
            return 0
        return len(events)
