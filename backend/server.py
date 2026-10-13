"""Container entrypoint: Cloud Run supplies PORT and terminates HTTPS."""

import os

import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be a valid TCP port.")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips="*",
        access_log=False,
        ws_max_size=32768,
        ws_max_queue=8,
        timeout_graceful_shutdown=8,
    )
