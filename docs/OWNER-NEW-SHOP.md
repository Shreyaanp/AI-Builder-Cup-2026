# Opening a new shop (owner answers, 15 October 2026)

Built on `feat/new-shop-flow` (PR #3) from the owner's six answers (PLAN-V2 §New-shop onboarding).
Codex's first version (stepped coach page) and its partial "grand" rework were merged in; what did
not match the answers was replaced.

## The flow

1. **Entry points:** the header "+", "Start my own shop" at the end of the tour, "Create your shop"
   on an empty My shop, and the existing "Add my shop" / shop-menu "New shop" / Google "Add shop
   details" buttons. None opens a dialog or sheet; the "Add my shop" form dialog is gone (the same
   form remains only as **Edit details** for a saved shop). First run after sign-in is unchanged:
   the coach's start card (its "Add my shop" now opens this flow).
2. **Hero** (`NewShopFlow.tsx` → `Hero`): full screen, "Let’s open your shop". A shop is drawn in
   chalk, the title written out, sparkles pop (GSAP through `useChalkTimeline`, nothing runs with
   reduced motion). One button: "Let’s begin" (it is also the gesture that unlocks audio and mic).
3. **Conversation = voice mode** (`Journey`, owner 16 Oct: "like ChatGPT voice mode"). One open,
   continuous conversation: the mic is on the whole time (never turns itself off; the owner can
   pause it). The coach speaks first. Phone (390×844), top to bottom: the shop card, the
   conversation (scrolls, takes the height it needs), the **stage** (a chalk orb with the live
   caption; it fills the remaining height, so a short conversation gets a big orb and a long one a
   compact orb, never dead space), quick actions, and the call controls: keyboard (type
   instead), mic (pause/resume, `aria-pressed`), coach voice (mute) and End voice. Desktop: the
   conversation, the stage and the shop card side by side (`VoiceStage.tsx`).
   - **Orb** (`VoiceOrb`): reacts to real audio levels every frame (mic analyser and the coach's
     playback bus, written to a CSS variable, no re-render per frame). Listening = mint, ripples
     with the owner's voice; thinking = lilac, a ring drawn over and over (the owner stopped
     talking and the coach is due); speaking = sunflower, swells with the coach's voice;
     connecting/reconnecting = sky, a dashed ring turning; paused/typing = quiet outline. Reduced
     motion keeps colour and shape only. Captions show both sides (the owner's live transcript in
     italics, the coach's words as it speaks).
   - **Shop card** (`ShopFill`): places for products and prices, location, hours, payment and
     delivery start as dashed chalk outlines; each answer lands in its place with a small stamp
     and glow, the name is written in chalk, and a tally shows how much is filled. Phone: one row
     that scrolls sideways; desktop: a full column with every item and price.
   - **Typing**: the keyboard button (or any voice failure) shows the composer with "Talk instead",
     mute and send. Typed turns go into the same live session when it is open.
   - **Reconnects** (`useVoice` conversation mode): the microphone, audio context and meters live
     for the whole conversation; when a Live socket ends (150 s cap, network, idle) the hook
     reconnects to the **same session id** with the mic still on, at once after a planned end and
     with growing pauses after failures (4 tries). The orb shows "Reconnecting…" meanwhile. A
     turn the coach never answered is sent again; a reply cut off mid-way stays in the chat.
   - **Alerts** (`VoiceAlert`, in the page, dismissible, never a modal): mic blocked (how to allow
     it: lock icon → Microphone → Allow; Try again / Type instead; detected before any session
     when the browser already says "denied"), no microphone, connection lost after the retries
     (Reconnect / Type instead), rate limited (counts down the wait), voice unavailable (carry on
     typing; Try again). The conversation always continues by text meanwhile.
4. **The agent drives and acts in the chat.** One question at a time (what you sell → location →
   hours → payment → delivery → halal for food). Every proposal the coach makes is shown as an
   action card in the chat ("Added to your shop · Shop name: … · Category: …"); a menu photo is
   "I read your menu: N items"; a location is "Saved your location: Near …". The draft builds
   live in the "Your shop so far" card at the top. Quick actions: Menu photo, My location, Skip.
5. **Silence:** ~9 s after the coach has finished speaking with no answer, the app tells the coach
   the owner is unsure; the coach replies in the chat with a suggestion or says it will leave the
   question out for now, and asks the next one (at most twice in a row, then it waits). "Skip"
   does the same at once.
6. **Review** (`Review`): a full-screen page in the flow (Back returns to the same conversation),
   one sealed proposal, one "Open my shop" button. Nothing is written before it.
7. **Ready:** "Your shop is ready" full screen (share, add photos, tour, continue).

## Backend

- `NEW_SHOP_INSTRUCTION` (agent.py): speak first, short spoken turns, never wait on silence —
  suggest/default/skip and move on; acknowledge photos and locations in one sentence.
- Offline fixture (`new_shop_reply`): greets on the first turn, asks the topics in order, and
  remembers questions the owner left unanswered (read from the session's own turns).
- Voice socket: a `{"kind": "new_shop", "draft": …}` frame may be resent mid-session so the tools
  keep building on what the owner sees after a photo or location (`refresh_new_shop_draft`).
- New-shop voice sessions (voice.py): the full 150 s window (kept under Cloud Run's 180 s request
  cap), 40 model calls and 40 text turns per socket instead of 8 and 12; the app reconnects to the
  same session when a socket ends, so the conversation is unbounded in practice.

## Evidence

Voice mode `tests/new-shop-voice.spec.ts` (phone + desktop, light + dark, axe): every state as
`docs/stories/new-shop-{1-hero,2-listening,3-thinking,4-speaking,5-reconnecting,6-mic-blocked,
7-typing,8-review,9-ready}-{light,dark}[-desktop].png`; mic blocked (refused and already denied)
→ alert + typing; the session ending twice → same session id, mic still on, conversation and
server history intact; lost connection → retries then Reconnect; rate limit countdown; voice
unavailable; the alert in all 15 languages. Story `tests/stories/s10-new-shop.spec.ts` (phone, screenshots `docs/stories/S10-*.png`):
"+" → hero → coach greets (mic on) → owner answers → action card → silence → coach moves on →
location and menu photo → review page → ready; plus tour end and empty My shop entries. Light and
dark axe passes of hero, chat, review and ready on phone and desktop: `tests/new-shop.spec.ts`.

## Not validated

Real Gemini Live greeting/turn-taking, microphone ASR, echo on a real phone speaker, and live
coaching quality (offline fixtures only). Browser emulation is not a physical phone. Translations
of the new strings are not native-speaker reviewed.
