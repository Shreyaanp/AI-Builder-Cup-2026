# Connect your system — Track N Handoff

Implements the "Connect your system" integration journey for shops using existing POS, billing, or ERP software (Petpooja, Tally, Zoho, Square, Shopify, SAP, and custom POS).

## Summary of Changes

### 1. Backend Mapping & Ingestion (`backend/app/connector.py`, `backend/app/connector_routes.py`)

- **Multi-format parser (`parse_any`)**: Parses CSV, XLSX, JSON (detects nested item arrays e.g. Petpooja `items` or `menu`), and XML (extracts Tally `VOUCHER` sales / ledger entries or `STOCKITEM` catalog records, as well as generic XML tags).
- **AI column mapping (`ai_map_fields`, `heuristic_map`)**: Gemini structured mapping via ADK with prompt schema, plus deterministic offline heuristic fallback mapping source columns to Chalkboard schema roles: `name`, `price`, `unit`, `stock`, `category`, `quantity`, `total`, `date`.
- **Diff engine (`diff_preview`)**: Calculates added, updated, removed, and unchanged items against active shop inventory, with minor currency unit normalization.
- **Review before save (`POST /sync`)**: Generates standard review proposals (`prepare_inventory` or `prepare_sales`) and marks them `needs_review`. Never writes directly or silently to the store.
- **Saved mapping reuse**: Stores confirmed mappings per shop + source label (`service.save_connector_mapping`), returning `reused: true` on subsequent imports from the same source.
- **Dual database support**: Both SQLite (`connector_mappings` table with indexes and `erase_owner` cascading delete) and Firestore (`connector_mappings` subcollections with batch deletes on erasure).

### 2. Realistic Offline Fixtures (`backend/tests/fixtures/connect/`)

- `pos_menu.csv`: Standard restaurant POS menu export with items, rates, categories, units, and inventory quantities.
- `tally_sales.xml`: Tally ERP 9 XML export with vouchers, ledger entries, and itemized sales.
- `shopify_products.csv`: E-commerce catalog export with Title, Variant Price, Variant Inventory Qty, and Type.
- `petpooja_menu.json`: POS JSON export structure with category lists and item arrays.
- `backend/tests/test_connector.py`: Comprehensive test suite covering parsing, heuristic mapping, diff calculation, store lifecycle (SQLite + Firestore), and review endpoint proposals.

### 3. Frontend Experience (`src/features/connect/`, `src/features/v1/`)

- **`ConnectSheet.tsx`**: Bottom sheet / dialog containing:
  - System picker: Text-only badges for Petpooja, Tally, Zoho, Square, Shopify, SAP, Other POS (no trademark logos).
  - Upload file (.csv, .xlsx, .json, .xml) or Paste sample tabs.
  - AI column mapping rows with confidence percentages (e.g. 95%, 100%).
  - One-tap role correction: Tap any row or chip to reassign Chalkboard roles (`name`, `price`, `unit`, `stock`, `category`, `quantity`, `total`, `date`, `none`).
  - Mapped preview rows showing actual parsed data.
  - Diff card showing added, updated, and removed items with WCAG AA compliant semantic M3 colors.
  - "Confirm & review import" / "Sync & review import" actions triggering proposal review.
- **`ConnectTile.tsx`**: Shop tile in My shop overview showing connection state ("POS / ERP" or connected system, "Last synced" timestamp, or "Not synced yet").
- **Entry points**:
  - **My shop**: `<ConnectTile />` in the `ShopTiles` overview grid.
  - **The coach**: "Connect your system" item with `Layers` icon in the attachment menu (`photoMenu`).
- **15 Locales (`strings.ts`)**: Fully localized in English, Hindi, Simplified Chinese, Malay, Tamil, Japanese, Korean, Indonesian, Thai, Vietnamese, Filipino, Bengali, Telugu, Marathi, and Kannada.

## Verification

- **Backend**:
  - `uv run ruff check app`: All checks passed.
  - `uv run mypy app`: Success: no issues found in 69 source files.
  - `uv run pytest -q`: 633 passed, 165 skipped in 163s (including all 10 connector tests).
- **Frontend**:
  - `npx tsc -b`: Clean, 0 type errors.
  - `npm run test:hooks`: Hook enforcement passed.
  - `npm run lint`: Clean, 0 errors, 0 warnings across entire repo.
  - `npm run build`: Production bundle built cleanly with Vite.
- **E2E & Accessibility**:
  - `tests/stories/s14-connect.spec.ts`: Passed all 8 steps.
  - Axe accessibility: WCAG 2A / 2AA clean across all dialogs, light theme, dark theme, phone (390x844), and desktop (1440x1000).
  - Story evidence generated:
    - `docs/stories/connect-1-select.png`
    - `docs/stories/connect-2-mapping.png`
    - `docs/stories/connect-3-diff.png`
    - `docs/stories/connect-4-synced.png`

## What is Not Verified

- Live Gemini model structured output in production cloud (offline heuristic mapper and structured schema tested; live Gemini requires Google AI Studio / Vertex AI credentials with cloud billing).
- External POS webhook push synchronizations (designed around owner-initiated export upload/paste sync).
