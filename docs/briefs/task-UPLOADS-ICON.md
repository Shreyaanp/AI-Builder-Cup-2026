# Uploads that work + shop icon (AI-generated or uploaded) (account 3, next free slot)

Owner (17 Oct 05:10): test the flows for menu upload, POS upload and other picture uploads; the shop needs
an icon: auto-generate vs upload. Decision: auto-generate with the Gemini image-generation model on Vertex
in our project (small cost per icon); the owner can regenerate or upload instead.

Branch feat/uploads-icon from origin/release/stable-2-main. Ports WEB_PORT=3871 API_PORT=3971,
RECALL_PATH=data/test-vectors. NEVER run commands in the background; foreground only, batches under 10 min;
`--workers=1`; no parallel sub-agents; plain commits, no AI trailers. Stay out of onboarding v2's files
(voice.py, NewShopFlow.tsx, NewShopStage.tsx, VoiceStage.tsx, agent.py onboarding): it will call your icon
API at the end of onboarding; document the API for it.
1. Walk and fix every upload on a 360px phone (camera + gallery, JPEG/PNG/HEIC, large files, bad photos,
   offline, permission denied, cancel): menu photo → items review; POS/Excel/CSV import (Connect your
   system); close-the-day photo; shop photo; product photo; invoice/receipt (Document AI path); face check.
   Each must: show progress, never freeze, recover with a clear next step, save exactly once (idempotent).
2. Shop icon: "Make my icon" generates a square icon from the shop name + kind + region with the Gemini
   image model (find the image model available in our Vertex project; pin it in settings with a switch
   SHOP_ICON_AI; cost guard: max 3 generations per shop per day); "Upload" uses the gallery/camera with crop
   to square. Shown on the shop card, customer page, results, map pin and PWA share. Fallback when off/fail:
   a themed monogram. Voice/AI tools: "make my icon", "use this photo as my icon".
3. Tests for each upload (fixtures, offline mode) + the icon (stubbed generator in tests; one live
   generation recorded in the PR). docs/qa/uploads.md. Push, PR, summarise.
