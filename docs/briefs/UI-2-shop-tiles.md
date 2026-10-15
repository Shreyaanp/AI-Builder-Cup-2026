# UI-2 — Phone declutter + "My shop" as glanceable tiles (after UI-1)

Same rules as UI-1 (branch `ui/coach-screen`, no main/push/release, no AI co-author, report in
`docs/briefs/UI-2-REPORT.md`, screenshots in `docs/briefs/ui-2-shots/`). Do UI-1 first.

Owner feedback from a real phone: "too much information", "cluttered", "not friendly".
Do NOT change the bottom navigation bar.

1. **Coach page = conversation first.** Above the conversation, at most ONE compact card (the
   self-filling shop card from UI-1). Move the "Today"/planning and any other cards off the coach
   page into My shop. Take a phone screenshot before and after; the first screen should be mostly
   conversation + the composer.
2. **Dynamic suggestions.** Suggestion chips under the coach reply must come from the current state,
   not a fixed list: no shop → "Send a photo of your board" / "Tell me your shop name"; shop with no
   items → "Add my menu"; items exist → "Something sold out?" / "Change a price"; shop not shared →
   "Share my customer page"; unread customer messages → "Reply to customers (n)". Max 3 chips.
   Rules-only (no AI) — mark it so in the code comment.
3. **My shop = Pixel / Google Health-style tiles.** A grid of rounded tiles (2 columns on phone):
   Shop details (name, hours, open now), Menu (item count + 3 top items with prices, "View all"),
   Sold out today (count, one-tap toggle list in a sheet), Customer page (shared? QR/link), Messages
   (unread count), Tomorrow's plan (planning), Readiness. Each tile shows a little and opens a bottom
   sheet with the full list/actions (reuse UI-1 sheet + motion). Products list becomes compact rows in
   the Menu sheet, not a long page.
4. **Google screen**: same tile/sheet treatment for the steps; keep every "Simulated — not connected"
   label visible (another worker is fixing the simulator logic — only restyle, don't change its logic).
Checks: tsc, eslint, prettier, `CI=1 npx playwright test tests/v1.spec.ts tests/v1-a11y.spec.ts --project=phone`
(update tests whose labels move).
