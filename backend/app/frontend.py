from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse


def serve_frontend(app: FastAPI, directory: str) -> None:
    root = Path(directory).resolve()
    if not (root / "index.html").is_file():
        raise RuntimeError("The compiled frontend is missing.")

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found.")
        candidate = (root / path).resolve()
        if not candidate.is_relative_to(root) or any(
            part.startswith(".") for part in Path(path).parts
        ):
            raise HTTPException(404, "File not found.")
        if candidate.is_file():
            headers = (
                {"Cache-Control": "public, max-age=31536000, immutable"}
                if path.startswith("assets/")
                else {}
            )
            return FileResponse(candidate, headers=headers)
        if Path(path).suffix or path.startswith("assets/"):
            raise HTTPException(404, "File not found.")
        return FileResponse(root / "index.html")
