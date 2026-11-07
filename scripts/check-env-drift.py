"""Fail when the live Cloud Run service has an env var the release would not carry.

Compares .deployment/runtime.json (rendered by deployment/runtime-config.py) and
deployment/secrets.json with the live service. Prints variable NAMES only, never values.

    python deployment/runtime-config.py && python scripts/check-env-drift.py
    python scripts/check-env-drift.py --live-file live.json   # gcloud describe --format=json
"""

import argparse
import json
import shutil
import subprocess
from pathlib import Path

# Changes on every release by design.
EXPECTED_TO_DIFFER = {"RELEASE_COMMIT"}
LIVE_SERVICE = ["ogoogle-ai", "--region=asia-south1", "--project=ichiropractic"]

parser = argparse.ArgumentParser()
parser.add_argument("--live-file", help="Read the live service from this JSON file instead of gcloud.")
parser.add_argument("--rendered", default=".deployment/runtime.json")
parser.add_argument("--secrets", default="deployment/secrets.json")
args = parser.parse_args()

if args.live_file:
    live_text = Path(args.live_file).read_text(encoding="utf-8")
else:
    live_text = subprocess.run(
        [shutil.which("gcloud") or "gcloud", "run", "services", "describe", *LIVE_SERVICE, "--format=json"],
        check=True, capture_output=True, text=True,
    ).stdout
containers = json.loads(live_text)["spec"]["template"]["spec"]["containers"]
live_plain, live_secret = {}, set()
for entry in containers[0].get("env", []):
    if "valueFrom" in entry:
        live_secret.add(entry["name"])
    else:
        live_plain[entry["name"]] = entry.get("value", "")

rendered = json.loads(Path(args.rendered).read_text(encoding="utf-8"))
secrets = set(json.loads(Path(args.secrets).read_text(encoding="utf-8")))

problems = []
dropped = sorted((set(live_plain) | live_secret) - set(rendered) - secrets)
if dropped:
    problems.append("live variables the release does not produce: " + ", ".join(dropped))
leaked = sorted(secrets & set(rendered))
if leaked:
    problems.append("secret variables written into the rendered config: " + ", ".join(leaked))
# Plain live variable that the release would turn into a secret (or the reverse) makes gcloud fail.
mixed = sorted((secrets & set(live_plain)) | (live_secret & set(rendered)))
if mixed:
    problems.append("variables that are secret in one place and plain in the other: " + ", ".join(mixed))

changed = sorted(
    name for name in set(rendered) & set(live_plain)
    if name not in EXPECTED_TO_DIFFER and rendered[name] != live_plain[name]
)
added = sorted(set(rendered) - set(live_plain) - live_secret)
if changed:
    print("NOTE values that will change (names only): " + ", ".join(changed))
if added:
    print("NOTE variables the release will add (names only): " + ", ".join(added))
if problems:
    for problem in problems:
        print("DRIFT " + problem)
    raise SystemExit(1)
print(f"No drift: all {len(live_plain) + len(live_secret)} live variables are carried by the release.")
