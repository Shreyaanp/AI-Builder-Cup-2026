# Tracks F (rest) + P: AI guide, payments & rides, landing page (Codex)

Create branch `feat/guide-payments-landing` from origin/main in your worktree; commit small (no AI
trailers), push, and open a PR with `gh pr create` (you have full access now).
Read docs/OWNER-NOTES.md, docs/HACKATHON-REVIEW.md, AGENTS.md and the house skills
(.agents/skills/content-design, progressive-disclosure, personalization, motion-and-delight,
ux-review-checklist). Ports WEB_PORT=3617 API_PORT=3717, RECALL_PATH=data/test-vectors.
**Do not change the theme.** Others own: the owner tab structure (Shop/Grow/You on feat/owner-tabs:
it builds the Grow grid; you build the feature screens its cards open, as standalone components
with a clear entry point documented in your handoff), onboarding, customer UI, supply chain,
trust/face, search engine, games.

## Build

1. **Payments & rides (P)**: a feature screen: UPI pay link + QR with amount (upi://pay with pa, pn,
   am, cu, tn; PhonePe/GPay/Paytm open it), copy/share; "Send a rider" deep links for Rapido, Uber,
   Porter with pickup at the shop pin and drop at a typed address/pin, falling back to the
   provider's web/app home when a deep link is unsupported; owner settings: their UPI ID (validated
   format), which providers to show. Never processes money; honest copy. Coach tool so the owner can
   say "send a payment link for ₹240 to the customer" and get the card in chat.
2. **"Talk to your coach" guide (F)**: a short, delightful guide reachable from You → Help and from the
   empty coach: 6-8 example things to say, grouped by job (keep the menu fresh, close the day,
   forecast and prep, find suppliers, rescue deals, answer customers, get on Google), each a tappable
   chip that sends that sentence to the coach. Personalised by business type. Also used as the
   coach's empty-state suggestions.
3. **Landing page (F)**: rewrite src/features/frontdoors (Marketing.tsx etc.) content so it screams
   that BOTH merchants and customers use Chalkboard: hero with the two journeys, the AI moments
   (voice onboarding, photo-to-menu, forecast, sourcing between shops, AI front door for customers,
   stamps), honest labels, phone first, same theme, motion per the skill. Keep existing routes and
   tests working (update them).

## Done

15 locales, phone + desktop, light + dark, axe clean, story/QA tests updated and new ones for the
payment link, rider links and guide chips, screenshots docs/stories/guide-_.png, payments-_.png,
landing-*.png, handoff docs/handoff/guide-payments-landing.md. Run backend tests, `npm run check`,
`npm run test:qa` (fresh DBs). If the machine is busy and browser tests time out, rerun the failing
files on their own before reporting.
