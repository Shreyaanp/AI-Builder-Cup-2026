from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response

# The public landing to show at "/": the frozen classic page, or the new one (LANDING_VARIANT).
LANDING_META = '<meta name="chalkboard-landing" content="new" />'


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
    async def frontend(path: str) -> Response:
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
            headers = (
                {"Cache-Control": "public, max-age=31536000, immutable"}
                if path.startswith("assets/")
                else {}
            )
            return FileResponse(candidate, headers=headers)
        if Path(path).suffix or path.startswith("assets/"):
            raise HTTPException(404, "File not found.")
        return index()
