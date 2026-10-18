# Golden upload dataset

Synthetic data only. No merchant records, secrets, downloads, server, cloud resources,
or paid models are needed. App code is unchanged. WEB_PORT=4351 and API_PORT=4451
are reserved if a later browser flow needs servers; this runner needs neither.

From the repository root (installed locked dependencies required):

```powershell
$env:UV_OFFLINE = '1'
uv run --project backend python -m tests.golden.run
uv run --project backend python -m pytest backend/tests/test_golden.py -q
```

The same module command works from `backend` with `uv run python -m tests.golden.run`.
Pytest discovers the structured golden gate during the normal backend CI suite.
Offline execution blocks socket connections and DNS. It never reads `.env` or
initializes provider clients. No background commands are needed.

## Case format and scoring

Each `cases/<id>/` has `case.json`, an input file, and `expected.json`.
Expected files are frozen, reviewable contracts, not generated from parser results.
Prices in connector/menu expectations are integer minor units; Document AI output
uses its native major-unit contract. Quantities are numeric. Tally preview dates
retain their exported YYYYMMDD representation. Supply units normalize SAP codes.

The runner calls the real `parse_any`, connector heuristic/preview, supply `parse`,
and Document AI `parse_document` functions. Every listed expected field must match;
list order, length, duplicates, nulls, and missing fields matter. Numeric 2 and 2.0
are equal. Unlisted object fields are outside that case's contract. The runner
prints per-case precision/recall/pass/fail, per-field scores, and separate structured
and fixture totals. Offline mismatches exit nonzero.

Image/PDF cases have synthetic `response.json` processor/model fixtures. Offline
menu tests validate image decoding and the extraction model contract. Document
cases test mapping of synthetic Document AI entities. Neither proves OCR, moderation,
AI accuracy, or successful provider transport. Their scores are separate from the
structured parser gate. `source.html` records the visible synthetic document.

`requirements.json` records desired fields that the current app cannot extract.
They are deliberately excluded from the supported-contract score and are reported
as coverage gaps, not passes. SKU, menu currency/sold-out extraction and receipt tax
remain unsupported. Do not treat 100% supported-contract scores as full feature proof.

## Coverage and limits

- English/Hindi/Tamil/Chinese menus, chai, bakery, hardware price lists, two sizes,
  INR/SGD, sold-out text; clean, CSS rotation/blur, and CSS low-light variants.
- Supplier invoice and retail receipt in PNG and PDF; total, tax, date, supplier,
  and line items are visible. Tax is a tracked unsupported requirement.
- Tally inventory vouchers/stock, Shopify, Square items/sales, Zoho Inventory,
  Petpooja, Loyverse, generic CSV/XLSX/JSON. Synthetic schemas represent common
  exports, not vendor-certified exhaustive compatibility. SAP IDocs are covered
  through the supply parser, not the generic connector preview.
- Empty, Latin-1, extra-column, missing-price and duplicate cases. The actual
  behavior is recorded in each case's notes: Latin-1 and extra columns are accepted
  silently; preview retains missing prices/duplicates. Separate pytest checks prove
  downstream missing-price skipping and duplicate collapse. No warning is invented.
- Supply create/change/replenishment drafts and supplier ORDRSP/DESADV/INVOIC in
  IDoc/CSV/text/JSON. Current SupplyDoc supports ORDERS, ORDRSP, DESADV, INVOIC only:
  change/forecast are ORDERS drafts, not native ORDCHG/DELFOR messages. DESADV IDoc
  carries no currency, so the parser returns XXX. Text has fewer fields than JSON.

## Add or regenerate cases

1. Add a small synthetic input and case metadata matching a nearby adapter.
2. Hand-review and write exact expected fields independently of the parser.
3. Add unsupported desired fields to `requirements.json`, with an explanation.
4. Run the runner and pytest gate; inspect the input visually for image/PDF cases.
5. Commit the input and expectations together through the orchestrator.

`build.py` holds the initial synthetic source literals. It uses supply renderers as
input encoders only; expected contracts are separate literals. Running it overwrites
the corpus, including placeholder media: always follow it with the renderer and
review every diff. Normal tests never rebuild expectations.

```powershell
uv run --project backend python -m tests.golden.build
node backend/tests/golden/render.mjs
```

The renderer uses installed Playwright Chromium and system fonts, blocks all page
requests, and closes its browser. No npm install or browser download is performed.
Rendering may vary with fonts/browser versions; frozen checked-in inputs are the
regression source of truth.

## Optional live evaluation

```powershell
uv run --project backend python -m tests.golden.run --live
```

This flag explicitly opts into real provider calls on a future authorized run.
No live calls were used to create or validate this dataset. Settings load process
environment only (`_env_file=None`); this runner never opens credential files or
prints settings/provider exception text. Configure COACH_MODE=gemini and the app's
normal provider environment outside the repository. Unconfigured live mode skips;
Document AI also needs its enabled processor configuration. Live mode is advisory
and always exits zero, including errors; do not add it to CI. Structured cases
still use deterministic parsers; menu cases use the real ingestion extractor;
receipts/invoices use the real Document AI reader. Provider accuracy and missing
required fields need separate review even when supported fields pass.
