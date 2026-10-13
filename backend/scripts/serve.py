"""Local review server; use the application factory for other environments."""

import uvicorn


def run() -> None:
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=3300,
        access_log=False,
        ws_max_size=32768,
        ws_max_queue=8,
    )


if __name__ == "__main__":
    run()
