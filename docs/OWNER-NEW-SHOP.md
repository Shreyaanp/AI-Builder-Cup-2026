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
3. **Conversation** (`Journey`): full screen, calm. The coach speaks first. With a microphone it
   opens one Gemini Live session (`useVoice` conversation mode): once the mic is granted the app
   sends the opening ("Hello! I want to open a new shop.", localized), the coach greets out loud,
   and the mic opens when the greeting has finished playing; turns then end by Live's own voice
   detection. Without a mic (refused, unsupported, session limit) the same conversation carries
   on by text and replies are read aloud by `/tts` (phone voice as fallback). Visible: mute
   (coach voice), mic on/off, live captions bar, and a composer that is always there.
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

## Evidence

Story `tests/stories/s10-new-shop.spec.ts` (phone, screenshots `docs/stories/S10-*.png`):
"+" → hero → coach greets (mic on) → owner answers → action card → silence → coach moves on →
location and menu photo → review page → ready; plus tour end and empty My shop entries. Light and
dark captures of hero, chat, review and ready on phone and desktop with an axe pass:
`tests/new-shop.spec.ts` → `docs/stories/new-shop-{1-hero,2-chat,3-review,4-ready}-{light,dark}[-desktop].png`.

## Not validated

Real Gemini Live greeting/turn-taking, microphone ASR, echo on a real phone speaker, and live
coaching quality (offline fixtures only). Browser emulation is not a physical phone. Translations
of the new strings are not native-speaker reviewed.
