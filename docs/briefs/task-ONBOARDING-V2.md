# Onboarding v2: Gemini-grade voice onboarding, no menu (account 3) — ADDS TO task-VOICE-RELIABILITY-URGENT.md

You were restarted on purpose. Your uncommitted work in this worktree (agent.py, contracts.py,
coordinator.py, firestore_memory.py, limits.py, main.py, streaming.py, voice.py, tests) is yours: inspect it,
keep it, continue. Finish everything in task-VOICE-RELIABILITY-URGENT.md AND this. Also merge
origin/fix/voice-language (PR #55, the Hindi language pin) if not already in. Same rules: NEVER run commands
in the background; foreground only, batches under 10 min; `--workers=1`; no parallel sub-agents; plain
commits, no AI trailers. Owner decisions (17 Oct 01:30, docs/OWNER-NOTES.md) are binding:

## Flow (owner-quizzed)

- Ask ONLY: shop name, what you sell (category), where (pin), hours, shop photo. NO MENU in onboarding.
  After onboarding, Today shows "Add your menu" first (photo / type buttons); the customer page shows
  "Menu coming soon" + chat with the shop until a menu exists.
- One sentence can fill many fields ("Lakshmi Tea Stall, chai aur samosa, Indiranagar metro ke paas"):
  fill everything heard, ask only what is missing, never in a fixed script order. Not deterministic.
- Confirmation: fill silently, then ONE summary card at the end (name, category, pin, hours, photo).
- Corrections ("nahi, Lakshmi Chai Point"): replace SILENTLY (card updates, no spoken confirmation), continue.
- Pin: use the device location ("are you at the shop now?" → GPS pin). Typed/spoken places only as fallback
  when location is denied or the owner is not at the shop.
- Hours: ask; parse per day ("subah 6 se raat 10, Sunday band"). "pata nahi"/silence → skip; Today shows
  "Add your hours"; the customer page shows "Hours not set" (never invent hours).
- Photo: ask; opens the in-chat camera card with a big Skip; "baad mein" also skips; Today reminds later.
- Go live AUTOMATICALLY as soon as name + category + pin are known (the rest fills in after).
- Face check: offered at the END of onboarding (after the summary card), skippable; skipped → Today reminder.
- "Review my shop" is ALWAYS available at any point, regardless of state (thinking, speaking, saving,
  reconnecting, mid-tool-call): tapping it (or saying it) opens the review of the current draft at once;
  it never waits for the model and never cancels or corrupts the conversation; closing it returns to the
  same step. Test it in every state.
- BUG (owner, 01:45): the "thinking" indicator keeps going forever. Every thinking/working state must
  end: on reply, on error, on stream end WITHOUT a final event (e.g. the run ended by the call cap / provider
  close / socket drop), on tool failure, and on a hard timeout (~12 s with no event → stop thinking, show
  "That took too long — try again" with Retry; voice: resume listening). Find every place the client sets
  thinking/pending (voice + text coach + onboarding) and make it impossible to stay on. Tests that kill the
  stream mid-turn and assert thinking stops.
- Resume after any drop: SILENT resume: show the draft card + the next step's UI (e.g. the map), no
  spoken greeting; never re-ask a filled field; the owner continues when ready.

## Smart, dynamic business understanding (owner 17 Oct 04:45: "if it is not smart there is no point")

Today onboarding is a fixed script: NEW_SHOP_TOPICS in backend/app/agent.py (name → sell → location →
hours → payment → delivery → halal), a food-shaped schema, FOOD/GENERIC templates in business_profile.py.
A self-cleaning HELMET STATION got asked "is it halal?". Fix the approach, not the symptom:

- Universal core only (name, what you offer, where, hours, photo). No payment/delivery/halal/veg/menu
  questions in onboarding at all.
- The agent first UNDERSTANDS the business: Gemini writes a structured profile from what the owner said
  (kind: product / service / food / mixed; what it is in the owner's words; offerings; who it's for; what a
  customer would want to know; which questions are relevant and which are NEVER relevant). Categories are
  created only when needed: keep the owner's own words as the category; map to a search group only when
  one clearly fits; never force a fixed list.
- At most 1-2 extra questions, and only when the profile is confident they apply. When unsure, ask nothing
  extra (a missed question is cheap, a wrong one breaks trust). Food details (halal/veg) only ever for food
  businesses, later via the coach, never in onboarding.
- Corrections like "nahi, yeh service hai" fix the kind silently.
- END ON REQUEST: an end_conversation tool. "bas", "ho gaya", "band karo", "that's all", "stop", "bye" → a short
  goodbye in the selected language, save everything, close the mic/session. If name+category+pin are not
  known yet, still end; the draft is saved and the next visit resumes silently. Always-visible End button.
- The offline fixture model must stop rewarding a fixed order: update it and the tests to the new behaviour.
- EVAL (live gemini-3.8-live / text model, owner's gcloud, small cost): ~40 very different businesses in
  Hindi and English, e.g. self-cleaning helmet station, tailor, mobile repair, tuition centre, flower seller,
  tea stall, pharmacy, laundry, pet grooming, bike repair, beauty parlour, photocopy shop, home bakery,
  yoga class, chai + mobile recharge (mixed), vague answers ("kuch bhi bechte hain"). Pass bar: ZERO
  irrelevant questions, >= 95% correct kind, every "bas" ends the conversation. Save the eval as a re-runnable
  script + results in docs/qa/onboarding-eval.md; any failure becomes a test case.

## Voice quality (Gemini-grade, ADK 2.12 RunConfig supports all of these; gemini-3.8-live)

- session_resumption (transparent) + context_window_compression (sliding window); handle GoAway by
  reconnecting with the resumption handle; remove the 40-call cap (max_llm_calls) for live and replace it
  with a ~15-minute session cap that ends politely ("let's continue by typing" + a tap to continue).
- realtime_input_config: VAD tuned for Indian speakers (longer silence before end of turn so owners who
  pause mid-sentence are not cut off); barge-in stops audio and captions together.
- enable_affective_dialog = true, proactivity on (short acknowledgements like "haan, likh liya" while
  saving). Check the live model accepts each option; if one is rejected, log it and fall back, never crash.
- Language: reply COMPLETELY in the selected language (Hindi or English etc.), never a mix, even if the
  owner speaks Hinglish; understand Hinglish input.
- One `update_shop(fields)` tool that saves several fields at once, idempotently; the draft lives in
  session state and the instruction shows "known / still missing" every turn.

## Proof

Tests for every rule above (backend + phone browser, Hindi locale). Then a live check (owner's gcloud, small
cost): 10 Hindi onboardings via the voice socket (text turns + one audio clip) on live gemini-3.8-live:
zero drops, zero repeated questions, first audio < 800 ms p50, no menu question, live after name+category+pin.
Record results in the PR. PR title: "Onboarding v2: never drops, never repeats, no menu, ~60 s to live".
