"""Write the owner feature map (app_guide.py) for the screens: src/features/v1/appGuide.json.

Usage (from backend/): uv run python -m scripts.export_app_guide, then prettier --write on the
file. tests/test_app_guide_paths.py fails while the JSON and app_guide.py disagree.
"""

import json
from pathlib import Path

from app.app_guide import export

TARGET = Path(__file__).resolve().parents[2] / "src" / "features" / "v1" / "appGuide.json"

if __name__ == "__main__":
    TARGET.write_text(json.dumps(export(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {TARGET}")
