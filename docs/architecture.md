# Architecture: Google services

One line per Google service the app calls, its switch and what happens without it. Streaming and
the coach runtime are described in [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md).

| Service | Where | Switch | Without it |
| --- | --- | --- | --- |
| **Document AI** (Expense parser for till receipts, Invoice parser for supplier invoices and delivery notes; `us`) | Close the day `/day/read` (`backend/app/document_ai.py`) | `DOCUMENT_AI_ENABLED` + processor IDs | Gemini vision reads the photo (also used whenever the Document AI reading is incomplete). Accuracy: [impact/document-ai.md](impact/document-ai.md) |
