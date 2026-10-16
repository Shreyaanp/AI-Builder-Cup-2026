"""One search engine: customers finding shops and items nearby, owners finding suppliers.

Meaning comes from Vertex AI text embeddings (`gemini-embedding-2`) of every shop and every menu
item. Vectors are cached by content: an item is embedded once, and again only when its text
changes, in batches, never on every request. Offline and in tests a deterministic concept
embedder stands in; it is a fixture, never a language model, and results say which one ran.

Ranking is hybrid and its weights live in WEIGHTS only: meaning, exact words, distance, open now,
price fit, menu freshness, the customer's own signals (stamps, follows, searches, shops opened)
and, for Google places, live popularity (rating and review count, shown with attribution and never
stored). Gemini explains a personal pick in one line for the top few only, cached.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import time
from collections import OrderedDict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from threading import Lock
from typing import Any, Literal, Protocol, cast

import anyio
import numpy as np
import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger()

DIMENSIONS = 768
Embedder = Callable[[list[str]], list[list[float]]]

# ---------------------------------------------------------------------------------------------
# Weights: the one place ranking is tuned (unit-tested in tests/test_search_engine.py)


@dataclass(frozen=True)
class Weights:
    semantic: float
    keyword: float
    distance: float
    open_now: float
    price: float
    fresh: float
    personal: float
    popular: float
    deal: float
    # Metres at which the distance part has fallen to 1/e.
    distance_scale_m: float


WEIGHTS: dict[str, Weights] = {
    # A neighbour on foot: meaning and words first, then a short walk, open now and their taste.
    "customer": Weights(
        semantic=0.26,
        keyword=0.2,
        distance=0.16,
        open_now=0.08,
        price=0.06,
        fresh=0.04,
        personal=0.12,
        popular=0.04,
        deal=0.04,
        distance_scale_m=1200,
    ),
    # A shop buying stock: the right item, then distance and price per unit; no taste signals.
    "sourcing": Weights(
        semantic=0.2,
        keyword=0.25,
        distance=0.3,
        open_now=0.0,
        price=0.2,
        fresh=0.05,
        personal=0.0,
        popular=0.0,
        deal=0.0,
        distance_scale_m=4000,
    ),
    # "Similar nearby": alike first; within the radius, nearer breaks near-ties.
    "similar": Weights(
        semantic=0.8,
        keyword=0.0,
        distance=0.2,
        open_now=0.0,
        price=0.0,
        fresh=0.0,
        personal=0.0,
        popular=0.0,
        deal=0.0,
        distance_scale_m=1200,
    ),
}
# Below this (calibrated) similarity a shop or item is not a meaning match on its own.
SHOP_RECALL = 0.4
ITEM_RECALL = 0.45
SOURCING_ITEM_RECALL = 0.72
# When nothing is that close (short queries with real embeddings score lower), items within
# RECALL_MARGIN of the best item in the neighbourhood still count, never below ITEM_RECALL_MIN.
RECALL_MARGIN = 0.06
ITEM_RECALL_MIN = 0.3
# "Similar nearby": how alike a shop or item must be to be shown.
SIMILAR_MIN = 0.4
# Raw cosine that counts as "unrelated" for Vertex embeddings (the fixture needs none).
LIVE_FLOOR = 0.35
# Personal picks: a taste match must be at least this strong to say "because ...".
TASTE_MIN = 0.35


@dataclass
class Components:
    """One candidate's raw signals. None means unknown and scores as neutral (0.5)."""

    semantic: float = 0.0
    keyword: float = 0.0
    distance_m: float = 0.0
    open_now: bool | None = None
    price_fit: float | None = None
    fresh_days: float | None = None
    personal: float = 0.0
    popularity: float | None = None
    deal: bool = False


def parts(c: Components, profile: str = "customer") -> dict[str, float]:
    w = WEIGHTS[profile]
    return {
        "semantic": w.semantic * clip(c.semantic),
        "keyword": w.keyword * clip(c.keyword),
        "distance": w.distance * math.exp(-max(0.0, c.distance_m) / w.distance_scale_m),
        "open_now": w.open_now * {True: 1.0, None: 0.5, False: 0.0}[c.open_now],
        "price": w.price * (0.5 if c.price_fit is None else clip(c.price_fit)),
        "fresh": w.fresh * (0.5 if c.fresh_days is None else math.exp(-c.fresh_days / 14)),
        "personal": w.personal * clip(c.personal),
        "popular": w.popular * (0.5 if c.popularity is None else clip(c.popularity)),
        "deal": w.deal * (1.0 if c.deal else 0.0),
    }


def blend(c: Components, profile: str = "customer") -> float:
    return round(sum(parts(c, profile).values()), 6)


def clip(value: float) -> float:
    return min(1.0, max(0.0, float(value)))


def popularity(rating: float | None, count: int | None) -> float | None:
    """Google rating and review count as 0..1 (live only; few reviews count for less)."""
    if rating is None or not count:
        return None
    return clip((rating - 1) / 4) * clip(math.log10(1 + count) / 3)


def fresh_days(last_confirmed: str | None, today: date | None = None) -> float | None:
    """Days since the owner last confirmed the menu (YYYY-MM-DD), or None."""
    if not last_confirmed:
        return None
    try:
        day = date.fromisoformat(str(last_confirmed)[:10])
    except ValueError:
        return None
    return float(max(0, ((today or datetime.now(UTC).date()) - day).days))


# ---------------------------------------------------------------------------------------------
# Embeddings


def normalize(vector: Sequence[float] | np.ndarray) -> np.ndarray:
    array = np.asarray(vector, dtype=np.float32)
    norm = float(np.linalg.norm(array))
    return array / norm if norm else array


def vertex_embedder(project: str, location: str, model: str) -> Embedder:
    """Vertex AI text embeddings, batched; one request per chunk of texts. (gemini-embedding-2
    returned identical vectors for every task_type we tried, so none is set.)"""
    from google import genai
    from google.genai import types

    client = genai.Client(vertexai=True, project=project, location=location)
    config = types.EmbedContentConfig(output_dimensionality=DIMENSIONS)

    def one(text: str) -> list[float]:
        result = client.models.embed_content(model=model, contents=text, config=config)
        return list((result.embeddings or [types.ContentEmbedding()])[0].values or [])

    def embed(texts: list[str]) -> list[list[float]]:
        clipped = [text[:2000] for text in texts]
        try:
            result = client.models.embed_content(
                model=model, contents=cast(Any, clipped), config=config
            )
            values = [list(e.values or []) for e in result.embeddings or []]
            if len(values) == len(clipped):
                return values
        except Exception:  # noqa: BLE001 - some embedding models take one text per request
            log.info("search_embed_batch_fallback", texts=len(clipped))
        return [one(text) for text in clipped]

    return embed


# Offline concept groups: words that mean the same kind of thing. The fixture embedder adds a
# shared concept direction to each word in a group, so "kopi" lands near "latte" without a model.
CONCEPTS: dict[str, str] = {
    "coffee": "coffee kopi espresso latte cappuccino americano mocha filter drip decoction "
    "brew cafe café flat white",
    "tea": "tea teh chai masala tarik matcha hojicha chaa lemongrass",
    "breakfast": "breakfast idli dosa vada poha upma paratha toast kaya egg omelette porridge "
    "congee lemak bakar morning",
    "bread": "bread bakery bun buns loaf croissant baguette pav sourdough naan shokupan pan "
    "roll rolls bakes bake baked puff",
    "sweet": "sweet sweets dessert desserts cake cakes pastry pastries kueh ladoo barfi halwa "
    "jamun cookie cookies biscuit biscuits chocolate mithai pudding tart cheesecake scone "
    "anpan jaggery",
    "snack": "snack snacks samosa pakora chaat bhel puri tikki fries chips bakwan puff street",
    "meal": "meal meals eat hungry lunch dinner rice biryani nasi goreng thali curry noodles "
    "mee mie soto kulche pav bhaji krapao misal kitchen food",
    "cold_drink": "cold iced ais es lassi soda lime nimbu pani juice jaljeera jeruk smoothie "
    "drink drinks",
    "produce": "fruit fruits vegetable vegetables produce banana bananas mango tomato onion "
    "potato greens sabzi",
    "dairy": "milk dairy paneer curd yogurt dahi cheese butter ghee",
    # Category words only: flour, sugar and salt are different things to a shop buying stock.
    "staples": "staples grocery kirana groceries provisions pantry",
    "flowers": "flower flowers florist bouquet bouquets garland marigold rose roses jasmine "
    "stems sunflower petal arrangement plant plants gift",
    "hair": "haircut hair salon barber beauty beard trim fringe styling blow comb grooming mask",
    "tailoring": "tailor tailoring alteration alterations hemming stitching fitting zip button "
    "trousers shirt kurta curtain needle repair mend",
    "hardware": "hardware tools tool screwdriver bulb led battery batteries tape hinge hooks "
    "electrical adhesive fix",
}
_CONCEPT_OF: dict[str, set[str]] = {}
for _concept, _words in CONCEPTS.items():
    for _word in _words.split():
        _CONCEPT_OF.setdefault(_word, set()).add(_concept)


def _slot(token: str) -> int:
    return int.from_bytes(hashlib.sha256(token.encode()).digest()[:4], "big") % DIMENSIONS


def _stem(word: str) -> str:
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


def fixture_vector(text: str) -> list[float]:
    """Deterministic offline stand-in for an embedding: words plus their concept groups."""
    vector = np.zeros(DIMENSIONS, dtype=np.float32)
    for word in re.findall(r"[^\W\d_]+", text.casefold())[:400]:
        stem = _stem(word)
        vector[_slot("w:" + stem)] += 1.0
        for concept in _CONCEPT_OF.get(word, set()) | _CONCEPT_OF.get(stem, set()):
            vector[_slot("c:" + concept)] += 2.0
    return normalize(vector).tolist()


def fixture_embedder(texts: list[str]) -> list[list[float]]:
    return [fixture_vector(text) for text in texts]


# ---------------------------------------------------------------------------------------------
# What gets embedded


def item_text(product: dict[str, Any]) -> str:
    category = str(product.get("category") or "").strip()
    name = str(product.get("name") or "").strip()
    return f"{name} ({category})" if category and category.casefold() != name.casefold() else name


def shop_text(shop: dict[str, Any]) -> str:
    """Name, kind of business, the owner's own description and the menu, in one passage."""
    facts = shop.get("facts") or {}
    story = " ".join(
        str(facts.get(key) or "") for key in ("story", "description", "specialty") if facts
    ).strip()
    menu = ", ".join(str(p.get("name") or "") for p in (shop.get("products") or [])[:40])
    supplies = ", ".join(str(s) for s in shop.get("supplies") or [])
    parts_ = [str(shop.get("name") or ""), str(shop.get("category") or ""), story, menu, supplies]
    return ". ".join(p for p in parts_ if p)


def fingerprint(text: str, model: str) -> str:
    return hashlib.sha256(f"{model}\0{text}".encode()).hexdigest()[:24]


class VectorDocuments(Protocol):
    """The community document store (SQLite locally, Firestore in production)."""

    def get(self, kind: str, key: str) -> dict[str, Any] | None: ...
    def put(
        self, kind: str, key: str, scope: str, created: float, data: dict[str, Any]
    ) -> None: ...


@dataclass
class ShopVectors:
    shop: np.ndarray | None
    items: dict[str, np.ndarray] = field(default_factory=dict)  # item name → vector


class VectorCache:
    """Per-shop vectors, keyed by content fingerprint, kept in memory and in one document per
    shop. Only texts whose fingerprint is unknown are embedded, batched and capped per call."""

    KIND = "search_vectors"
    MAX_NEW_PER_CALL = 256
    MAX_QUERIES = 512

    def __init__(
        self, embed: Embedder, model: str, docs: VectorDocuments | None, calibration: float
    ) -> None:
        self.embed = embed
        self.model = model
        self.docs = docs
        # Unrelated texts still score ~0.5 with real embeddings; similarity is rescaled above it.
        self.calibration = calibration
        self.memory: dict[str, np.ndarray] = {}
        self.loaded: set[str] = set()
        self.queries: OrderedDict[str, np.ndarray] = OrderedDict()
        self.lock = Lock()
        self.embedded = 0  # texts sent to the embedder since start (for tests and the eval)

    def _load(self, shop_id: str) -> None:
        if self.docs is None or shop_id in self.loaded:
            return
        self.loaded.add(shop_id)
        try:
            stored = self.docs.get(self.KIND, f"{self.model}:{shop_id}") or {}
        except Exception:  # noqa: BLE001 - a cold cache only costs an embedding
            log.warning("search_vectors_unreadable")
            return
        for key, values in (stored.get("vectors") or {}).items():
            if isinstance(values, list) and len(values) == DIMENSIONS:
                self.memory.setdefault(key, normalize(values))

    def _save(self, shop_id: str, keys: Iterable[str]) -> None:
        if self.docs is None:
            return
        vectors = {
            key: [round(float(v), 5) for v in self.memory[key]]
            for key in keys
            if key in self.memory
        }
        try:
            self.docs.put(
                self.KIND,
                f"{self.model}:{shop_id}",
                self.KIND,
                time.time(),
                {"model": self.model, "vectors": vectors},
            )
        except Exception:  # noqa: BLE001 - vectors are a cache; the next call can re-embed
            log.warning("search_vectors_unsaved")

    def _embed(self, texts: dict[str, str]) -> None:
        missing = [(key, text) for key, text in texts.items() if key not in self.memory]
        if not missing:
            return
        missing = missing[: self.MAX_NEW_PER_CALL]
        try:
            values = self.embed([text for _, text in missing])
        except Exception:  # noqa: BLE001 - meaning drops out; words, distance and hours remain
            log.warning("search_embed_unavailable", texts=len(missing))
            return
        self.embedded += len(missing)
        for (key, _), vector in zip(missing, values, strict=False):
            if vector:
                self.memory[key] = normalize(vector)

    def shops(self, shops: Sequence[dict[str, Any]]) -> dict[str, ShopVectors]:
        """Vectors for each shop and its items (new or changed texts are embedded first)."""
        with self.lock:
            # shop id → (its own text key, item name → text key)
            plan: dict[str, tuple[str, dict[str, str]]] = {}
            wanted: dict[str, str] = {}
            dirty: set[str] = set()
            for shop in shops:
                self._load(shop["id"])
                own = shop_text(shop)
                own_key = fingerprint(own, self.model)
                wanted[own_key] = own
                items: dict[str, str] = {}
                for product in shop.get("products") or []:
                    text = item_text(product)
                    items[str(product.get("name"))] = key = fingerprint(text, self.model)
                    wanted[key] = text
                plan[shop["id"]] = (own_key, items)
                if any(key not in self.memory for key in (own_key, *items.values())):
                    dirty.add(shop["id"])
            self._embed(wanted)
            result: dict[str, ShopVectors] = {}
            for shop_id, (own_key, items) in plan.items():
                result[shop_id] = ShopVectors(
                    self.memory.get(own_key),
                    {name: self.memory[key] for name, key in items.items() if key in self.memory},
                )
                if shop_id in dirty:
                    self._save(shop_id, [own_key, *items.values()])
            return result

    def query(self, text: str) -> np.ndarray | None:
        key = text.strip().casefold()[:300]
        if not key:
            return None
        with self.lock:
            if key in self.queries:
                self.queries.move_to_end(key)
                return self.queries[key]
        try:
            values = self.embed([key])
        except Exception:  # noqa: BLE001 - meaning drops out; the rest of ranking remains
            log.warning("search_query_embed_unavailable")
            return None
        if not values or not values[0]:
            return None
        vector = normalize(values[0])
        with self.lock:
            self.embedded += 1
            self.queries[key] = vector
            while len(self.queries) > self.MAX_QUERIES:
                self.queries.popitem(last=False)
        return vector

    def similarity(self, a: np.ndarray | None, b: np.ndarray | None) -> float:
        """Cosine similarity, rescaled so unrelated texts sit at 0 and identical at 1."""
        if a is None or b is None:
            return 0.0
        cosine = float(np.dot(a, b))
        return clip((cosine - self.calibration) / (1 - self.calibration))

    def likeness(self, a: ShopVectors, b: ShopVectors) -> float:
        """How alike two shops are: their whole passages, and their three closest items
        (a café and a bakery share banana bread and cookies, not a whole menu)."""
        whole = self.similarity(a.shop, b.shop)
        if not a.items or not b.items:
            return whole
        mine = np.stack(list(a.items.values()))
        theirs = np.stack(list(b.items.values()))
        best = np.sort((mine @ theirs.T).max(axis=1))[::-1][:3]
        items = float(
            np.mean([clip((c - self.calibration) / (1 - self.calibration)) for c in best])
        )
        return 0.5 * whole + 0.5 * items


# ---------------------------------------------------------------------------------------------
# The customer's own signals and why a pick is personal


class Taste(BaseModel):
    """This customer's own activity (never anyone else's). Saved shops are followed shops."""

    follows: list[str] = Field(default_factory=list, max_length=200)
    stamped: dict[str, int] = Field(default_factory=dict)  # shop id → visits
    asked: list[str] = Field(default_factory=list, max_length=20)  # recent searches, newest first
    opened: list[str] = Field(default_factory=list, max_length=30)  # shops opened on this device

    @property
    def empty(self) -> bool:
        return not (self.follows or self.stamped or self.asked or self.opened)


class Because(BaseModel):
    """Why a pick is personal, as facts the app words in each language."""

    kind: Literal["followed", "stamped", "opened", "asked", "like_stamped", "like_followed"]
    shop_id: str | None = None
    shop: str | None = None
    item: str | None = None
    query: str | None = None


def taste_score(
    shop_id: str,
    vectors: ShopVectors | None,
    taste: Taste,
    known: dict[str, tuple[dict[str, Any], ShopVectors]],
    asked: list[tuple[str, np.ndarray]],
    similarity: Callable[[np.ndarray | None, np.ndarray | None], float],
    likeness: Callable[[ShopVectors, ShopVectors], float],
) -> tuple[float, Because | None]:
    """0..1 affinity from this customer's own activity, with the strongest reason."""
    best: tuple[float, Because | None] = (0.0, None)

    def consider(value: float, because: Because) -> None:
        nonlocal best
        if value > best[0]:
            best = (value, because)

    visits = taste.stamped.get(shop_id, 0)
    if visits:
        consider(min(1.0, 0.7 + 0.1 * visits), Because(kind="stamped", shop_id=shop_id))
    if shop_id in taste.follows:
        consider(0.85, Because(kind="followed", shop_id=shop_id))
    if shop_id in taste.opened:
        consider(0.45, Because(kind="opened", shop_id=shop_id))
    if vectors is None or vectors.shop is None:
        return best
    for source_id, (source, source_vectors) in known.items():
        if source_id == shop_id or source_vectors.shop is None:
            continue
        stamped = source_id in taste.stamped
        followed = source_id in taste.follows
        if not (stamped or followed):
            continue
        value = likeness(vectors, source_vectors) * (0.9 if stamped else 0.8)
        if value < TASTE_MIN:
            continue
        # The item they know there that is closest to this shop's menu: "filter coffee at
        # Sharma's".
        item = max(
            source_vectors.items.items(),
            key=lambda pair: max(
                [similarity(pair[1], own) for own in vectors.items.values()]
                or [similarity(pair[1], vectors.shop)]
            ),
            default=(None, None),
        )[0]
        consider(
            value,
            Because(
                kind="like_stamped" if stamped else "like_followed",
                shop_id=source_id,
                shop=str(source.get("name") or ""),
                item=item,
            ),
        )
    for query, vector in asked:
        value = similarity(vectors.shop, vector) * 0.75
        consider(value, Because(kind="asked", query=query))
    return best


# ---------------------------------------------------------------------------------------------
# The engine


@dataclass
class Relevance:
    """How one shop relates to a query by meaning: the shop and each of its items."""

    shop: float = 0.0
    items: dict[str, float] = field(default_factory=dict)

    @property
    def best(self) -> float:
        return max([self.shop, *self.items.values()])


def item_recall(meaning: dict[str, Relevance]) -> float:
    """The item threshold for this search: fixed, or relative to the best item nearby."""
    best = max((v for r in meaning.values() for v in r.items.values()), default=0.0)
    return min(ITEM_RECALL, max(best - RECALL_MARGIN, ITEM_RECALL_MIN))


class SimilarProvider(Protocol):
    """Recommendations AI "similar items", when that integration is switched on."""

    def similar_items(
        self,
        shop_id: str,
        item: str | None,
        limit: int,
        products: Sequence[dict[str, Any]] = (),
    ) -> list[str]: ...


class SearchEngine:
    def __init__(
        self,
        embed: Embedder,
        model: str,
        docs: VectorDocuments | None = None,
        *,
        live: bool = False,
        explainer: Explainer | None = None,
    ) -> None:
        self.live = live
        # Measured on gemini-embedding-2 (docs/impact/search-eval.md): unrelated shop items sit
        # at raw cosine 0.45-0.63, matching ones at 0.60-0.78; 0.35 puts ITEM_RECALL near 0.64.
        self.cache = VectorCache(embed, model, docs, LIVE_FLOOR if live else 0.0)
        self.explainer = explainer
        self.similar_provider: SimilarProvider | None = None

    @property
    def mode(self) -> Literal["vertex", "fixture"]:
        return "vertex" if self.live else "fixture"

    # Sync on purpose: callers run these in a worker thread (embedding I/O is blocking).

    def vectors(self, shops: Sequence[dict[str, Any]]) -> dict[str, ShopVectors]:
        return self.cache.shops(shops)

    def relevance(self, query: str, shops: Sequence[dict[str, Any]]) -> dict[str, Relevance]:
        vector = self.cache.query(query)
        vectors = self.vectors(shops)
        result = {}
        for shop in shops:
            own = vectors.get(shop["id"]) or ShopVectors(None)
            result[shop["id"]] = Relevance(
                shop=self.cache.similarity(vector, own.shop),
                items={
                    name: self.cache.similarity(vector, item) for name, item in own.items.items()
                },
            )
        return result

    def personal(
        self,
        candidates: Sequence[dict[str, Any]],
        taste: Taste,
        known: Sequence[dict[str, Any]],
    ) -> dict[str, tuple[float, Because | None]]:
        """Affinity of each candidate to this customer's own stamps, follows, searches, opens."""
        if taste.empty:
            return {}
        sources = [s for s in known if s["id"] in taste.stamped or s["id"] in taste.follows]
        vectors = self.vectors([*candidates, *sources])
        known_vectors = {s["id"]: (s, vectors[s["id"]]) for s in sources if s["id"] in vectors}
        asked = [
            (q, vector) for q in taste.asked[:5] if (vector := self.cache.query(q)) is not None
        ]
        return {
            shop["id"]: taste_score(
                shop["id"],
                vectors.get(shop["id"]),
                taste,
                known_vectors,
                asked,
                self.cache.similarity,
                self.cache.likeness,
            )
            for shop in candidates
        }

    def similar(
        self,
        anchor: dict[str, Any],
        item: str | None,
        shops: Sequence[dict[str, Any]],
        limit: int = 6,
    ) -> tuple[
        list[tuple[dict[str, Any], float, str | None]], Literal["recommendations", "embeddings"]
    ]:
        """Shops (and their closest item) most like this shop or this item, and which source
        found them: Recommendations AI when switched on and ready, else embeddings."""
        others = [s for s in shops if s["id"] != anchor["id"]]
        if self.similar_provider is not None:
            try:
                ids = self.similar_provider.similar_items(
                    anchor["id"], item, limit, anchor.get("products") or []
                )
                by_id = {s["id"]: s for s in others}
                picked: list[tuple[dict[str, Any], float, str | None]] = [
                    (by_id[i], 1.0, None) for i in ids if i in by_id
                ]
                if picked:
                    return picked[:limit], "recommendations"
            except Exception:  # noqa: BLE001 - embeddings are the fallback
                log.warning("recs_similar_unavailable")
        vectors = self.vectors([anchor, *others])
        own = vectors.get(anchor["id"]) or ShopVectors(None)
        target = own.items.get(item) if item else None
        if target is None and item:
            target = self.cache.query(item)
        mine: list[np.ndarray] = (
            [target]
            if target is not None
            else list(own.items.values()) or ([own.shop] if own.shop is not None else [])
        )
        if not mine:
            return [], "embeddings"
        scored = []
        for shop in others:
            theirs = vectors.get(shop["id"]) or ShopVectors(None)
            available = {
                str(p["name"]) for p in shop.get("products") or [] if p.get("available", True)
            }
            # Their available item closest to this item (item page) or to this menu (shop page).
            closeness = {
                name: max(self.cache.similarity(v, vector) for v in mine)
                for name, vector in theirs.items.items()
                if name in available
            }
            best_item = max(closeness, key=lambda n: closeness[n], default=None)
            if item:
                best = max(
                    self.cache.similarity(target, theirs.shop) * 0.9,
                    closeness.get(best_item, 0.0) if best_item else 0.0,
                )
            else:
                best = self.cache.likeness(own, theirs)
            if best >= SIMILAR_MIN:
                scored.append((shop, best, best_item))
        scored.sort(key=lambda entry: -entry[1])
        return scored[:limit], "embeddings"


# ---------------------------------------------------------------------------------------------
# One-line explanations (Gemini, top few only, cached)


class Explainer:
    """Gemini words "Because you liked filter coffee at Sharma's" for the top personal picks,
    once per (pick, reason, language); offline the app words the same facts itself."""

    MAX_PICKS = 3
    MAX_CACHE = 1024

    def __init__(self, client_factory: Callable[[], Any], model: str) -> None:
        self.factory = client_factory
        self.client: Any = None
        self.model = model
        self.cache: OrderedDict[str, str] = OrderedDict()
        self.calls = 0

    @staticmethod
    def key(shop_id: str, because: Because, language: str) -> str:
        return json.dumps([shop_id, because.model_dump(), language], sort_keys=True)

    async def explain(self, picks: list[tuple[str, str, Because]], language: str) -> dict[str, str]:
        """picks: (shop id, shop name, because). Returns shop id → one line."""
        lines: dict[str, str] = {}
        todo = []
        for shop_id, name, because in picks[: self.MAX_PICKS]:
            key = self.key(shop_id, because, language)
            if key in self.cache:
                self.cache.move_to_end(key)
                lines[shop_id] = self.cache[key]
            else:
                todo.append((shop_id, name, because, key))
        if not todo:
            return lines
        from google.genai import types

        prompt = (
            "Write one short line (max 12 words) per pick, in language "
            f'"{language}", telling a customer why this nearby shop suits them, from the '
            'reason given only. Start like "Because you ...". Never invent facts. JSON list of '
            "strings, same order.\n"
            + "\n".join(
                f"- Pick: {name}. Reason: {because.model_dump_json(exclude_none=True)}"
                for _, name, because, _ in todo
            )
        )
        try:
            if self.client is None:
                self.client = self.factory()
            with anyio.fail_after(5):
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_json_schema={"type": "array", "items": {"type": "string"}},
                        temperature=0.3,
                        max_output_tokens=300,
                    ),
                )
            self.calls += 1
            written = json.loads(response.text or "[]")
        except Exception:  # noqa: BLE001 - the app words the same facts itself
            log.warning("search_explain_unavailable")
            return lines
        for (shop_id, _, _, key), line in zip(todo, written, strict=False):
            if isinstance(line, str) and 0 < len(line.strip()) <= 120:
                lines[shop_id] = self.cache[key] = line.strip()
        while len(self.cache) > self.MAX_CACHE:
            self.cache.popitem(last=False)
        return lines


def build_engine(settings: Any, docs: VectorDocuments | None) -> SearchEngine:
    """Vertex embeddings when Gemini runs on Vertex (and the switch allows), else the fixture."""
    choice = getattr(settings, "search_embeddings", "auto")
    vertex_ready = (
        settings.coach_mode == "gemini"
        and settings.gemini_backend == "vertex"
        and bool(settings.google_cloud_project)
    )
    live = choice == "vertex" or (choice == "auto" and vertex_ready)
    explainer = None
    if settings.coach_mode == "gemini" and getattr(settings, "search_explanations", True):

        def client() -> Any:
            from google import genai

            if settings.gemini_backend == "vertex":
                return genai.Client(
                    vertexai=True,
                    project=settings.google_cloud_project,
                    location=settings.google_cloud_location,
                )
            return genai.Client(api_key=settings.google_api_key.get_secret_value())

        explainer = Explainer(client, settings.google_text_model)
    if live:
        embed = vertex_embedder(
            settings.google_cloud_project,
            settings.google_embedding_location,
            settings.embedding_model,
        )
        return SearchEngine(embed, settings.embedding_model, docs, live=True, explainer=explainer)
    return SearchEngine(fixture_embedder, "fixture-concepts-v1", docs, explainer=explainer)
