# Document AI vs Gemini vision on receipts and invoices

Measured 16 Oct 2026, live, one pass. Raw numbers: [document-ai.json](document-ai.json).
Reproduce with `uv run python scripts/document_ai_eval.py --project ichiropractic --receipt-processor c55114827549fb20 --invoice-processor cb3082fc49117ceb` (from `backend/`).

## Setup

- **Document AI**: pretrained Expense parser `pretrained-expense-v1.4.2-2024-09-12` (till receipts)
  and Invoice parser `pretrained-invoice-v2.0-2023-12-06` (supplier invoices, delivery notes), both
  in `us`. The Expense parser is not offered in asia-south1, and the Invoice parser there is the
  2022 model, so both run in `us`. Created with the REST API (`processors.create`).
- **Gemini**: `gemini-3.5-flash` on Vertex `global`, the exact prompt and schema Close the day uses
  (`backend/app/day_close.py`).
- **Photos**: six phone-style renders in `backend/tests/fixtures/documents/` with ground truth in
  `truth.json` (made by `scripts/make_document_fixtures.py`): a Singapore kopitiam receipt with
  two-row items, an Indian kirana bill, a bakery Z report, an Indian GST tax invoice, a Singapore
  wholesale invoice and a column-less delivery note. 26 item lines, 15 of them with sale amounts.
  Both readers get the same sanitised JPEG the app sends.

## Results

| Reader | Lines found | Quantity right | Sale amount right | Extra lines | Date right | Median time |
| --- | --- | --- | --- | --- | --- | --- |
| Document AI alone | 23 / 26 | 22 / 26 | 13 / 15 | 1 | 6 / 6 | 5.3 s |
| Gemini alone | 26 / 26 | 26 / 26 | 15 / 15 | 0 | 6 / 6 | 5.7 s |
| **App pipeline** (Document AI if complete, else Gemini) | **26 / 26** | **26 / 26** | **15 / 15** | **0** | **6 / 6** | 9.2 s |

The app pipeline used Document AI's reading for 3 of 6 photos (the Z report and both columned
invoices) and Gemini for the other 3.

Where Document AI fell short:

- **Kopitiam receipt**: the last item's price row was not returned, so one line had no amount.
- **Kirana bill**: one line came back without its quantity.
- **Delivery note without columns**: all three rows came back as one merged line item
  (quantity "321"). Invoice number, date and total were still right.

Fixed in our mapping, not counted as misses above: two-row receipts come back as an item row
plus a price-only row (joined back together), and "22 x Egg Tart" carries its count in the
description (split out).

What Document AI adds that the Close-the-day Gemini prompt does not ask for: invoice number, PO
reference, supplier name and document total on every invoice (3 / 3 right), which is what the
supply chain needs to match an invoice to its purchase order (`supply_reading()` maps it to the
supply chain's canonical invoice reading).

## Decision

- Document AI is the first reader for till receipts and supplier invoices, behind
  `DOCUMENT_AI_ENABLED`. A **completeness check** decides whether its reading is used: every line
  needs a quantity, till lines also need an amount, and no merged rows. Otherwise Gemini reads the
  photo, so the owner never gets a half-read photo. Provider errors also fall back to Gemini.
- Cost of that safety: on a doubtful photo both readers run (9–12 s instead of ~5 s). Readings are
  cached by image hash, so a retry of the same photo calls neither again within the process.
- Stock-count sheets are not receipts or invoices: Gemini reads them.

## Limits of this evidence

Six rendered photos are a small, clean set: no crumpled thermal paper, handwriting, glare or
non-Latin scripts. Latency varies run to run (Gemini's median was 9.2 s on the first run, 5.7 s on
the second). This shows the integration works and where each reader breaks; it is not a
field-accuracy figure. Billing: both parsers are billed per page
([pricing](https://cloud.google.com/document-ai/pricing)); this evaluation used 18 pages in total
across three runs.
