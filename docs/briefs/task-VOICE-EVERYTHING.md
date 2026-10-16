# Everything by voice + instant answers + context caching (Codex)

Branch `feat/voice-everything` from origin/main; commit small (no AI trailers), push, `gh pr create`.
Read docs/OWNER-NOTES.md, backend/app/agent.py (INSTRUCTION, tools), coordinator.py, streaming.py,
voice.py, customer/discover ask code. Ports WEB_PORT=3717 API_PORT=3817, RECALL_PATH=data/test-vectors.

## Owner's vision

"Every feature can be done through voice, for the vendor and the customer, without clicking buttons.
Ask about the app and the agent explains it; ask how to run the business; it learns from the owner."
"Use the template/embeddings so common requests are instant; use smart AI for unstructured data."

1. **ADK tool coverage audit**: list every owner and customer feature and whether the agent has a tool
   for it (docs/qa/agent-tool-coverage.md). Add the missing tools so each feature is doable by
   conversation: e.g. open/close shop today, hours change, add/remove photo request, start close-the-day,
   reply to a customer question, start a rescue deal, share my page/QR, Get on Google next step,
   connect my POS, privacy/delete requests (always confirm), stamps/perks setup; customer side: find,
   follow, ask the owner, directions, my stamps. Every write still goes through the existing review/
   approval boundary. Add an "app guide" tool so "how do I…?" questions get correct answers from a
   maintained feature list.
2. **Instant path (sub-100 ms perceived)**: before calling Gemini, a fast router (rules + Vertex
   embeddings of known intents, cached) handles common requests: sold out, price change, back in stock,
   open/closed, hours, FAQ answers from stored facts, status questions. Return an immediate card/answer;
   fall back to the agent when unsure. Optimistic UI on the client for review cards.
3. **Starter templates per business type**: from the business profile, prefill likely items/units
   (tea shop: masala chai, cutting chai, samosa…; tailor: blouse stitching, alterations…) as SUGGESTIONS
   the owner confirms; menus/POS uploads remain the source of truth (Gemini structures unstructured data).
4. **Vertex context caching** for the long coach instruction + tool schemas (use the Vertex AI context
   cache API with the ADK/genai client; fall back gracefully if unavailable); measure the gain.
5. **Latency measurement**: log time-to-first-token / first audio per flow (p50/p95); a short report
   docs/impact/latency.md with before/after. Check whether the Gemini Live model is available in an
   Asia region closer to India and document the RTT difference (do not change production yourself).
   Tests for every new tool and the router; coach eval scenarios for voice-everything. Run backend tests
   and `npm run check`.
