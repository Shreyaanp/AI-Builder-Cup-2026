"""Allow backend test utilities to run from the repository root."""

import sys
from pathlib import Path

_backend = Path(__file__).resolve().parents[1] / "backend"
__path__.append(str(_backend / "tests"))
sys.path.insert(0, str(_backend))
