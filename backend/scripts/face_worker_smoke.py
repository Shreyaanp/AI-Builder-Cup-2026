"""Loopback-only smoke check for the real worker image; uses a synthetic test token."""

import argparse
import io
import json
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", type=Path, help="Optional consented WebM/MP4 test capture")
    args = parser.parse_args()
    origin = "http://127.0.0.1:3401"
    headers = {
        "Authorization": "Bearer local-smoke-fixture-only",
        "X-Owner": "local-smoke-owner",
        "X-Prompts": "turn_left,turn_right",
    }

    def call(path: str, method: str, body: bytes | None = None):
        request = urllib.request.Request(origin + path, data=body, headers=headers, method=method)
        # Ignore system proxies: this script must only call the local container.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(request, timeout=90) as response:
            return json.load(response)

    assert call("/health", "GET")["models_ready"] is True
    if args.capture:
        capture = args.capture.read_bytes()
        headers["Content-Type"] = "video/webm" if args.capture.suffix == ".webm" else "video/mp4"
    else:
        # A generated image exercises real decoding/inference rejection without biometric data.
        image = io.BytesIO()
        Image.new("RGB", (320, 240), "gray").save(image, format="JPEG")
        capture = image.getvalue()
        headers["Content-Type"] = "image/jpeg"
    assert len(capture) <= 8 * 1024 * 1024
    try:
        result = call("/evaluate", "POST", capture)
        assert result["status"] == "review_pending"
        assert result["reason"] not in {"worker_unavailable", "models_unavailable"}
        if not args.capture:
            assert result["reason"] == "capture_not_usable"
        print("Evaluate result:", result["reason"])
    finally:
        assert call("/template", "DELETE") == {"status": "deleted"}
    print("Model readiness, evaluate and template deletion passed on loopback.")


if __name__ == "__main__":
    main()
