# Demo video script (under 3 minutes)

Target length **2:50**. Two phones, filmed by the owner: phone A is the shop owner, phone B is a
customer. One owner story (voice onboarding in Hindi → live shop), one customer story (first open →
shop → QR stamp). Everything shown is real app behaviour, recorded on the live app.

Sources for what is safe to show: `docs/STATUS-LEDGER.md` (main checkout, 17 Oct 12:50),
`docs/google-ai.md`, `docs/qa/manual-test-script.md`. Every claim in the voice-over is checked in
`docs/submission/claims-check.md`.

## Before you record: the gate

Record only when every row is ✅ on the live app. If a row is not ready, use the fallback or wait.

| Needed for                         | Ledger item                                                      | Status 17 Oct 12:50 | If not live by recording time                                                          |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| Shots 3–8 (Hindi voice onboarding) | #91 Onboarding v2 + voice crash hotfix #95                       | 🔧                  | Do not record the owner story on the old flow (it asks for a menu and can drop). Wait. |
| Shots 3–8 on a phone screen        | #83 create-shop on mobile (in #91)                               | 🔧                  | Same as above.                                                                         |
| ₹ prices, Hindi, UPI on phone B    | #90 region persona (release 4)                                   | 🟢                  | Set phone B's language to Hindi by hand; prices may show in the wrong currency.        |
| Shot 9 (customer first open)       | #60 front door (release 3)                                       | 🟢                  | None needed once release 3/4 is shipped.                                               |
| Shot 11 (shop page cards)          | #78 customer layout (release 4)                                  | 🟢                  | Record anyway; the layout is older but works.                                          |
| Shot 12 (QR stamp, 3 of 10)        | #63 welcome stamps (release 3)                                   | 🟢                  | None needed once release 3/4 is shipped.                                               |
| Whole video                        | Production carries release 4 + #91 (prod was `8073239` at 12:50) | ⏳                  | Check the footer build/commit on both phones before recording.                         |

Do **not** show, even if it appears on screen: the face check (bug #74, still failing), the
"Browse everything nearby" page (🔧), Google Maps publishing, photo → menu reading, Recommendations
AI, Looker Studio. If the coach offers the face check at the end, say "बस" and move on.

## Set up (off camera, 15 minutes)

1. **Phone A (owner):** sign in to `https://business.chalkboard.shreyaan.work` with a fresh Google
   account that has no shop. App language: **You → Language → हिन्दी**. Light theme. Stand at the
   real shop (or the spot you will pin). Location and mic allowed for the site.
2. **Screen recording:** turn on the phone's screen recorder with **device audio + microphone**, so
   the coach's voice and the owner's voice are both captured. Turn on Do Not Disturb.
3. **Shop name:** use the real stall's name only with the owner's consent. Otherwise use a fictional
   name. This script uses **अम्मा टी पॉइंट (Amma Tea Point)**.
4. **Phone B (customer):** a browser profile that has never opened Chalkboard (or clear site data),
   phone language Hindi, location on, not signed in.
5. **After shot 8, before shot 9 (off camera):** on phone A, in the coach chat, type the menu so the
   customer has something to find: "चाय ₹15, मसाला चाय ₹20, मैगी ₹40, बिस्कुट ₹10". Approve the
   card. Then **Shop → Customer page → Thank-you perks**: set a scratch-card prize ("एक चाय मुफ़्त"),
   tap **Save perks**, and open the counter QR. Put the QR on the counter (print it, or show it on
   a laptop or tablet).
6. Rehearse once end to end. Delete the rehearsal shop afterwards so the take starts fresh
   (**You → Privacy & your data**).

## Shot list

VO = voice-over, recorded separately and laid over the edit (English, ~140 words per minute).
Owner and coach audio in Hindi plays as recorded, with English captions. Times are for the final
cut.

### Opening (0:00–0:15)

**Shot 1 · 0:00–0:08 · Real-world B-roll.** Hand-held: the tea stall, the owner pouring chai, a
customer at the counter. No phone yet.

- VO: "This tea stall has served the same street for years. Everyone nearby knows it. Online, it
  doesn't exist."
- Caption: none.

**Shot 2 · 0:08–0:15 · Title card.** Chalkboard logo on the app's chalk-green background.

- VO: "Chalkboard puts a small shop online with one conversation, in the owner's own language."
- Caption: **Chalkboard** · Your shop, online in one conversation

### Owner story (0:15–1:35)

**Shot 3 · 0:15–0:25 · Phone A screen recording.**

- Do: on the Coach tab tap **+** (top bar). On "Let's open your shop" tap **Let's begin**. Allow the
  mic if asked.
- See: the orb starts listening, the "Your shop so far" card is empty at the top, the coach greets
  in Hindi.
- VO: "No form. The owner taps once and talks."
- Caption: Gemini Live · speaks Hindi

**Shot 4 · 0:25–0:50 · Phone A. One sentence fills the card.**

- Do: say, naturally, in one breath:
  "नमस्ते। मेरी दुकान का नाम अम्मा टी पॉइंट है। हम चाय, मैगी और बिस्कुट बेचते हैं।"
- See: the name and the offerings appear on "Your shop so far". The coach answers in Hindi and asks
  where the shop is.
- VO: none. Let the conversation play.
- Captions (English subtitles, timed to the speech):
  - Owner: "Hello. My shop is called Amma Tea Point. We sell tea, Maggi and biscuits."
  - Coach: subtitle whatever it actually says (expected: "Lovely, a tea stall! Are you at the
    shop right now?").
- Side caption: One sentence → three fields

**Shot 5 · 0:50–1:05 · Phone A. The pin.**

- Do: tap **My location**, allow location, nudge the map so the pin sits on the stall, tap **This
  is my shop**.
- See: "Where is your shop?" map card, then the chat confirms the saved location. The shop goes
  live by itself now that it has a name, a kind and a place.
- VO: "A name, what it sells, and where it is. That's enough. The shop is live."
- Caption: Live once name + what you sell + place are known

**Shot 6 · 1:05–1:16 · Phone A. Hours and photo.**

- Do: when the coach asks about hours, say: "सुबह छह से रात दस बजे तक, हर दिन।" When it asks for
  a photo, tap **Skip** (or say "फ़ोटो बाद में").
- See: hours on the card; the coach moves on without asking again.
- Captions: Owner: "Six in the morning to ten at night, every day." · Coach: subtitle as spoken.

**Shot 7 · 1:16–1:21 · Phone A. Done.**

- Do: say "बस।"
- See: the conversation ends politely, nothing is lost.
- Caption: "बस" (that's it) ends it. Nothing is lost.

**Shot 8 · 1:21–1:35 · Phone A. Review.**

- Do: tap **Review my shop**.
- See: one summary card: name, what it sells, area, hours, live.
- VO: "It only asks what fits the business. A helmet shop never gets asked about halal food. In our
  test of forty different businesses, it asked zero irrelevant questions."
- Caption: 0 irrelevant questions in 215 · 40-business test
- Editing: put a small timer in the corner from shot 3's tap to "live" in shot 5, from the raw
  take (pauses trimmed in the edit, the timer keeps real time). Write the real number in the
  caption: "Live in [MEASURE ON TAKE] s".

### Customer story (1:35–2:32)

**Shot 9 · 1:35–1:45 · Phone B screen recording. First open.**

- Do: open `chalkboard.shreyaan.work/explore`. On "Start with your neighbourhood" use the current
  location.
- See: the Ask page with big chips at the bottom and nearby shops as cards.
- VO: "Now a customer, opening Chalkboard for the first time. Nothing to install, no sign-up."
- Caption: First open · no app, no sign-up

**Shot 10 · 1:45–1:58 · Phone B. Ask.**

- Do: type "पास में चाय" in the composer (or tap a chai chip if one shows) and send.
- See: a short answer, then cards with item, ₹ price and distance, and a small map. Amma Tea Point
  is in the cards.
- VO: "Ask it the way you'd ask a friend. Gemini works out what you want, and the answer comes from
  shops' real menus."
- Caption: Answers from the shops' own menus

**Shot 11 · 1:58–2:10 · Phone B. The shop.**

- Do: tap the Amma Tea Point card. Tap **Chat with the shop**, then the **Price** chip (or type
  "मसाला चाय कितने की है?").
- See: the shop page in Hindi with ₹ prices and the stamp card at 2 of 10 (welcome stamps). The chat
  answers at once from the menu: "Instant answer".
- VO: "The menu the owner typed a minute ago is already here, in Hindi."
- Caption: Instant answer from the owner's menu

**Shot 12 · 2:10–2:32 · Phone B at the counter. The stamp.**

- Do: scan the counter QR with the phone camera and open the link. Rub the scratch card (or tap
  **Reveal**).
- See: "First try! +50 points", the scratch card reveals "एक चाय मुफ़्त", and the stamp card
  moves to **3 of 10**.
- VO: "At the counter, scan the QR. A stamp, a scratch card, a reason to come back. For the
  owner, a regular."
- Caption: Scan → stamp → scratch card · one stamp a day

### Close (2:32–2:50)

**Shot 13 · 2:32–2:44 · Both phones side by side** (owner Today on A, customer stamp card on B).

- VO: "Built on Gemini and Gemini Live on Vertex AI, Cloud Text-to-Speech, Firebase sign-in,
  Firestore and Cloud Run."
- Caption: Gemini · Gemini Live · Cloud Text-to-Speech · Firebase Auth · Firestore · Cloud Run

**Shot 14 · 2:44–2:50 · End card.**

- VO: "Chalkboard. Every small shop, one conversation from online."
- Caption: chalkboard.shreyaan.work · business.chalkboard.shreyaan.work

## Voice-over, in one block (for recording)

Read at an easy pace. 178 words ≈ 1:16 at 140 words per minute. Each line fits inside its shot.

> This tea stall has served the same street for years. Everyone nearby knows it. Online, it doesn't
> exist.
>
> Chalkboard puts a small shop online with one conversation, in the owner's own language.
>
> No form. The owner taps once and talks.
>
> A name, what it sells, and where it is. That's enough. The shop is live.
>
> It only asks what fits the business. A helmet shop never gets asked about halal food. In our test
> of forty different businesses, it asked zero irrelevant questions.
>
> Now a customer, opening Chalkboard for the first time. Nothing to install, no sign-up.
>
> Ask it the way you'd ask a friend. Gemini works out what you want, and the answer comes from shops'
> real menus.
>
> The menu the owner typed a minute ago is already here, in Hindi.
>
> At the counter, scan the QR. A stamp, a scratch card, a reason to come back. For the owner, a
> regular.
>
> Built on Gemini and Gemini Live on Vertex AI, Cloud Text-to-Speech, Firebase sign-in, Firestore and
> Cloud Run.
>
> Chalkboard. Every small shop, one conversation from online.

## Editing notes

- Total: 2:50. Hard limit 3:00; leave the 10 seconds as margin.
- The coach takes 1.5–2.5 s to start speaking after the owner stops (ledger: first-audio item). Trim
  dead air between turns, but never speed up or cut into the coach's own speech, and keep the
  corner timer honest.
- If the coach's Hindi differs from the expected lines above, subtitle what it actually said.
  Never re-voice or dub the coach.
- Do not add captions with numbers other than the two in this script (the 0-of-215 eval and the
  timer from your own take).
- Shot 8's "zero irrelevant questions" line depends on #91 (`docs/qa/onboarding-eval.md` on that
  branch). If #91 is not merged when you cut the video, drop that sentence and its caption.
- Music: low, no lyrics, ducked under the voice.
