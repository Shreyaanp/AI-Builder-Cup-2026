"""Download publisher manifests, verify every artifact, preserve notices. No inference."""

import hashlib
import json
import urllib.request
from pathlib import Path

import yaml

ROOT = Path("data/face-models")
MODELS = [
    "face-detection-retail-0004",
    "landmarks-regression-retail-0009",
    "head-pose-estimation-adas-0001",
    "face-reidentification-retail-0095",
]


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    base = "https://raw.githubusercontent.com/openvinotoolkit/open_model_zoo/"
    # Fixed publisher release; builds must not follow a changing master branch.
    commit = "2023.3.0"
    receipts = []
    for group, name in [("intel", n) for n in MODELS] + [("public", "anti-spoof-mn3")]:
        manifest = fetch(f"{base}{commit}/models/{group}/{name}/model.yml")
        info = yaml.safe_load(manifest)
        directory = ROOT / name
        directory.mkdir(exist_ok=True)
        (directory / "model.yml").write_bytes(manifest)
        (directory / "LICENSE.txt").write_bytes(fetch(info["license"]))
        (directory / "README.md").write_bytes(
            fetch(f"{base}{commit}/models/{group}/{name}/README.md")
        )
        for artifact in info["files"]:
            filename = artifact["name"]
            if group == "intel" and not filename.startswith("FP32/"):
                continue
            data = fetch(artifact["source"])
            if (
                len(data) != artifact["size"]
                or hashlib.sha384(data).hexdigest() != artifact["checksum"]
            ):
                raise RuntimeError("Publisher model checksum mismatch")
            output = directory / filename
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(data)
            receipts.append(
                {
                    "model": name,
                    "file": filename,
                    "sha384": artifact["checksum"],
                    "source": artifact["source"],
                    "license": info["license"],
                    "commit": commit,
                }
            )
        print("Verified model artifacts:", name)
    (ROOT / "verified.json").write_text(json.dumps(receipts, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
