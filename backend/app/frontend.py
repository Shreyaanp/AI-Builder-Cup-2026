import logging
import mimetypes
import re
from html import escape
from pathlib import Path
from typing import Any

import anyio
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response

from .robots import NOINDEX, is_business_hostname, is_demo_path

logger = logging.getLogger(__name__)

# The public landing to show at "/": the frozen classic page, or the new one (LANDING_VARIANT).
LANDING_META = '<meta name="chalkboard-landing" content="new" />'
IMMUTABLE = "public, max-age=31536000, immutable"
# OB-78: scripts/precompress.mjs writes these beside each hashed asset at build time, so a new
# instance never spends its CPU compressing the same files for every first visitor.
ENCODINGS = (("br", ".br"), ("gzip", ".gz"))


def accepted_encodings(request: Request) -> set[str]:
    accepted: set[str] = set()
    for part in request.headers.get("accept-encoding", "").split(","):
        name, _, params = part.strip().partition(";")
        quality = params.strip().removeprefix("q=").strip()
        if name and quality not in {"0", "0.0", "0.00", "0.000"}:
            accepted.add(name.strip().lower())
    return accepted


def asset_response(request: Request, candidate: Path) -> Response:
    headers = {"Cache-Control": IMMUTABLE, "Vary": "Accept-Encoding"}
    accepted = accepted_encodings(request)
    media_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
    if media_type.startswith("text/") or media_type == "application/javascript":
        media_type += "; charset=utf-8"
    for encoding, suffix in ENCODINGS:
        compressed = candidate.with_name(candidate.name + suffix)
        if encoding in accepted and compressed.is_file():
            return FileResponse(
                compressed,
                media_type=media_type,
                headers={**headers, "Content-Encoding": encoding},
            )
    return FileResponse(candidate, media_type=media_type, headers=headers)


# OB-273: link previews (WhatsApp, Facebook) and search engines do not run JavaScript, so the
# head of each public page is written by the server.
SITE_NAME = "Chalkboard"
HOME_TITLE = "Chalkboard — your shop, live and up to date"
HOME_DESCRIPTION = (
    "Chalkboard keeps small shops visible: snap your chalkboard or speak in any language, "
    "approve every detail, and share a live menu with customers."
)
HOW_TITLE = "How Chalkboard works"
HOW_DESCRIPTION = (
    "See how a shop owner and a customer use Chalkboard: snap the board, approve, share a menu."
)
SHOP_PATH = re.compile(r"^/(?:explore/)?s/([^/]+)$")
PUBLIC_SITEMAP_PATHS = ("/", "/how-it-works")
ROBOTS_META = f'<meta name="robots" content="{NOINDEX}" />'
# A shop page is served without shop tags when the lookup takes longer than this.
LOOKUP_SECONDS = 0.3
# The one thing under /api/ a crawler may fetch: the photo that og:image and twitter:image name.
PREVIEW_PHOTOS = "/api/v1/public/shops/*/photos/*.jpg$"

# Previews and search titles name the area only (locality, city at most), never a street,
# block, unit, house number or postal code: `location` is often a full address (a confirmed
# pin saves Google's formatted_address), and a home business's address must not reach
# WhatsApp cards or search results.
FICTIONAL = re.compile(r"\s*\(fictional address\)\s*$", re.I)
POSTCODE = re.compile(r"\b\d{4,6}\b")
STREET_WORDS = re.compile(
    r"\b(?:block|blk|unit|flat|floor|fl|apt|apartment|house|plot|door|no|road|rd|street|st|"
    r"avenue|ave|lane|ln|drive|dr|crescent|cres|close|way|boulevard|blvd|marg|cross|main|"
    r"highway|hwy|tower|building|bldg|level|lorong|jalan|jln)\b",
    re.I,
)
COUNTRIES = {
    "india", "malaysia", "indonesia", "thailand", "philippines", "vietnam", "sri lanka",
    "bangladesh", "nepal", "pakistan", "united states", "usa", "us", "united kingdom", "uk",
    "australia", "canada", "uae", "united arab emirates",
}  # fmt: skip
CITY_STATES = {"singapore", "hong kong", "macau", "monaco"}
REGIONS = {
    "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat",
    "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala", "madhya pradesh",
    "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "punjab",
    "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh",
    "uttarakhand", "west bengal", "nct of delhi", "selangor", "johor", "penang",
}  # fmt: skip


def area_of(location: str) -> str:
    """Locality and city at most, from a free-text location; '' when no part is safely an area.

    A part is dropped when it has a digit, '#', or a street or unit word; countries and states
    are dropped too. A part that carried the postal code is the state, except in a city-state.
    """
    kept: list[str] = []
    for raw in FICTIONAL.sub("", location).split(","):
        part = " ".join(raw.split())
        had_postcode = bool(POSTCODE.search(part))
        part = " ".join(POSTCODE.sub(" ", part).split())
        lower = part.lower()
        if (
            not part
            or any(ch.isdigit() for ch in part)
            or "#" in part
            or STREET_WORDS.search(part)
            or lower in COUNTRIES
            or lower in REGIONS
            or (had_postcode and lower not in CITY_STATES)
        ):
            continue
        if not kept or kept[-1].lower() != lower:
            kept.append(part)
    return ", ".join(kept[-2:])


def origin_of(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def head_tags(*, title: str, description: str, url: str, image: str, noindex: bool) -> str:
    def meta(attr: str, key: str, value: str) -> str:
        return f'<meta {attr}="{key}" content="{escape(value, quote=True)}" />'

    tags = [
        f"<title>{escape(title)}</title>",
        meta("name", "description", description),
        meta("property", "og:type", "website"),
        meta("property", "og:site_name", SITE_NAME),
        meta("property", "og:title", title),
        meta("property", "og:description", description),
        meta("property", "og:image", image),
        meta("property", "og:url", url),
        meta("name", "twitter:card", "summary_large_image" if "/photos/" in image else "summary"),
        meta("name", "twitter:title", title),
        meta("name", "twitter:description", description),
        meta("name", "twitter:image", image),
        ROBOTS_META if noindex else f'<link rel="canonical" href="{escape(url, quote=True)}" />',
    ]
    return "\n    ".join(tags)


def with_head(html: str, tags: str) -> str:
    html = re.sub(r"<title>.*?</title>", "", html, count=1, flags=re.S)
    html = re.sub(r'<meta\s+name="description"[^>]*?/>', "", html, count=1, flags=re.S)
    return html.replace("</head>", f"    {tags}\n  </head>", 1)


async def find_shop(request: Request, shop_id: str) -> dict[str, Any] | None:
    """The shared shop for a preview, read off the event loop; None if missing, broken or slow."""
    merchant = getattr(request.app.state, "merchant", None)
    if merchant is None:
        return None
    # One shop record is enough for a preview; the page's own API call reads the menu.
    lookup = getattr(merchant, "share_card", None) or merchant.public_shop
    try:
        with anyio.fail_after(LOOKUP_SECONDS):
            shop = await anyio.to_thread.run_sync(lookup, shop_id, abandon_on_cancel=True)
    except TimeoutError:  # a preview service may cache this generic card, so make it countable
        logger.warning("Link preview lookup for shop %s took over %ss", shop_id, LOOKUP_SECONDS)
        return None
    except Exception:  # a slow or broken lookup must never hold up or break the page itself
        return None
    return shop if isinstance(shop, dict) else None


def shop_tags(request: Request, shop: dict[str, Any], shop_id: str, noindex: bool) -> str:
    origin = origin_of(request)
    name = str(shop["name"])
    area = area_of(str(shop.get("location") or ""))
    gallery = shop.get("gallery") or []
    image = (
        f"{origin}/api/v1/public/shops/{shop['id']}/photos/{gallery[0]}.jpg"
        if gallery
        else f"{origin}/icons/customer-512.png"
    )
    where = f" in {area}" if area else ""
    return head_tags(
        title=f"{name} — {area}" if area else name,
        description=f"See what {name} has today{where}, live on Chalkboard.",
        url=f"{origin}/explore/s/{shop_id}",
        image=image,
        # Sample shops are never in search results.
        noindex=noindex or bool(shop.get("demo")),
    )


async def page_tags(request: Request, route: str, noindex: bool) -> str | None:
    """Head tags for a public page, or None for any other page."""
    origin = origin_of(request)
    icon = f"{origin}/icons/customer-512.png"
    match = SHOP_PATH.match(route)
    if match:
        shop = await find_shop(request, match.group(1))
        return shop_tags(request, shop, match.group(1), noindex) if shop else None
    pages = {
        "/": (HOME_TITLE, HOME_DESCRIPTION),
        "/demo": (HOME_TITLE, HOME_DESCRIPTION),
        "/how-it-works": (HOW_TITLE, HOW_DESCRIPTION),
    }
    if route not in pages:
        return None
    title, description = pages[route]
    url = f"{origin}{route}" if route != "/" else f"{origin}/"
    return head_tags(title=title, description=description, url=url, image=icon, noindex=noindex)


def serve_frontend(app: FastAPI, directory: str, landing_variant: str = "classic") -> None:
    root = Path(directory).resolve()
    if not (root / "index.html").is_file():
        raise RuntimeError("The compiled frontend is missing.")

    async def index(request: Request, path: str = "") -> Response:
        route = "/" + path.strip("/")
        noindex = is_business_host(request) or is_demo_path(route)
        tags = await page_tags(request, route, noindex)
        if tags is None and not noindex and landing_variant != "new":
            return FileResponse(root / "index.html")
        html = (root / "index.html").read_text(encoding="utf-8")
        if landing_variant == "new":
            html = html.replace("<head>", f"<head>\n    {LANDING_META}", 1)
        if tags is not None:
            html = with_head(html, tags)
        elif noindex:
            html = html.replace("</head>", f"    {ROBOTS_META}\n  </head>", 1)
        noindex = noindex or (tags is not None and ROBOTS_META in tags)
        return HTMLResponse(html, headers={"X-Robots-Tag": NOINDEX} if noindex else None)

    @app.get("/robots.txt", include_in_schema=False)
    async def robots(request: Request) -> Response:
        if is_business_host(request):
            body = "User-agent: *\nDisallow: /\n"
        else:
            body = (
                "User-agent: *\nDisallow: /demo\nDisallow: /explore/demo\nDisallow: /api/\n"
                f"Allow: {PREVIEW_PHOTOS}\n\n"
                f"Sitemap: {origin_of(request)}/sitemap.xml\n"
            )
        return Response(body, media_type="text/plain; charset=utf-8")

    @app.get("/sitemap.xml", include_in_schema=False)
    async def sitemap(request: Request) -> Response:
        if is_business_host(request):
            raise HTTPException(404, "No sitemap here.")
        origin = origin_of(request)
        urls = "".join(f"<url><loc>{origin}{p}</loc></url>" for p in PUBLIC_SITEMAP_PATHS)
        body = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>\n'
        )
        return Response(body, media_type="application/xml; charset=utf-8")

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str, request: Request) -> Response:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found.")
        candidate = (root / path).resolve()
        if not candidate.is_relative_to(root) or any(
            part.startswith(".") for part in Path(path).parts
        ):
            raise HTTPException(404, "File not found.")
        if candidate == root / "index.html":
            return await index(request)
        if candidate.is_file():
            if path.startswith("assets/"):
                return asset_response(request, candidate)
            return FileResponse(candidate)
        if Path(path).suffix or path.startswith("assets/"):
            raise HTTPException(404, "File not found.")
        return await index(request, path)


def is_business_host(request: Request) -> bool:
    return is_business_hostname(request.url.hostname or "")
