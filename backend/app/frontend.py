import mimetypes
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


def serve_frontend(app: FastAPI, directory: str, landing_variant: str = "classic") -> None:
    root = Path(directory).resolve()
    if not (root / "index.html").is_file():
        raise RuntimeError("The compiled frontend is missing.")

    def index() -> Response:
        if landing_variant != "new":
            return FileResponse(root / "index.html")
        html = (root / "index.html").read_text(encoding="utf-8")
        return HTMLResponse(html.replace("<head>", f"<head>\n    {LANDING_META}", 1))

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
            return index()
        if candidate.is_file():
            if path.startswith("assets/"):
                return asset_response(request, candidate)
            return FileResponse(candidate)
        if Path(path).suffix or path.startswith("assets/"):
            raise HTTPException(404, "File not found.")
        return index()
