import mimetypes
import re
from html import escape
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response

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
NOINDEX = "noindex, nofollow"


def is_business_host(request: Request) -> bool:
    host = (request.url.hostname or "").lower()
    return host.startswith("business.") or host.endswith(".run.app")


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
        meta("name", "robots", NOINDEX)
        if noindex
        else f'<link rel="canonical" href="{escape(url, quote=True)}" />',
    ]
    return "\n    ".join(tags)


def with_head(html: str, tags: str) -> str:
    html = re.sub(r"<title>.*?</title>", "", html, count=1, flags=re.S)
    html = re.sub(r'<meta\s+name="description"[^>]*?/>', "", html, count=1, flags=re.S)
    return html.replace("</head>", f"    {tags}\n  </head>", 1)


def shop_tags(request: Request, shop_id: str, noindex: bool) -> str | None:
    merchant = getattr(request.app.state, "merchant", None)
    if merchant is None:
        return None
    try:
        shop = merchant.public_shop(shop_id)
    except Exception:  # a broken lookup must never break the page itself
        return None
    if shop is None:
        return None
    origin = origin_of(request)
    name = str(shop["name"])
    area = str(shop.get("location") or "").strip()
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
        noindex=noindex,
    )


def page_tags(request: Request, path: str) -> str | None:
    """Head tags for a public page, or None for any other page (served unchanged)."""
    origin = origin_of(request)
    route = "/" + path.strip("/")
    business = is_business_host(request)
    icon = f"{origin}/icons/customer-512.png"
    if route == "/demo":
        return head_tags(
            title=HOME_TITLE,
            description=HOME_DESCRIPTION,
            url=f"{origin}/demo",
            image=icon,
            noindex=True,
        )
    match = SHOP_PATH.match(route)
    if match:
        return shop_tags(request, match.group(1), business)
    if route == "/how-it-works":
        return head_tags(
            title=HOW_TITLE,
            description=HOW_DESCRIPTION,
            url=f"{origin}{route}",
            image=icon,
            noindex=business,
        )
    if route == "/":
        return head_tags(
            title=HOME_TITLE,
            description=HOME_DESCRIPTION,
            url=f"{origin}/",
            image=icon,
            noindex=business,
        )
    return None


def serve_frontend(app: FastAPI, directory: str, landing_variant: str = "classic") -> None:
    root = Path(directory).resolve()
    if not (root / "index.html").is_file():
        raise RuntimeError("The compiled frontend is missing.")

    def index(request: Request, path: str = "") -> Response:
        tags = page_tags(request, path)
        if tags is None and landing_variant != "new":
            return FileResponse(root / "index.html")
        html = (root / "index.html").read_text(encoding="utf-8")
        if landing_variant == "new":
            html = html.replace("<head>", f"<head>\n    {LANDING_META}", 1)
        if tags is None:
            return HTMLResponse(html)
        headers = {"X-Robots-Tag": NOINDEX} if NOINDEX in tags else None
        return HTMLResponse(with_head(html, tags), headers=headers)

    @app.get("/robots.txt", include_in_schema=False)
    async def robots(request: Request) -> Response:
        if is_business_host(request):
            body = "User-agent: *\nDisallow: /\n"
        else:
            body = (
                "User-agent: *\nDisallow: /demo\nDisallow: /api/\n\n"
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
            return index(request)
        if candidate.is_file():
            if path.startswith("assets/"):
                return asset_response(request, candidate)
            return FileResponse(candidate)
        if Path(path).suffix or path.startswith("assets/"):
            raise HTTPException(404, "File not found.")
        return index(request, path)
