# Owner Phone Manual Test Script (v2)

**Checked against main at `7349b1f` on 16 Oct 2026** (stable release 1 plus #41, #46 and #47).

- Owner app: `https://business.chalkboard.shreyaan.work`
- Customer app: `https://chalkboard.shreyaan.work/explore`
- Use a real phone (Chrome on Android or Safari on iOS) with real mic, camera, GPS and network.
  Have a second phone or a laptop for the customer side.
- Tick **Pass** or **Fail** for each step. For a fail, write the step number and what you saw.
- Steps marked _live only_ need live Gemini or real hardware. The local check used offline
  fixtures, so it confirmed only the screens and labels for those steps.

Screenshots of the new screens at 360 px: [`docs/qa/manual-v2/`](manual-v2/).

---

## 15-minute smoke (do this first)

The 12 most important steps. If one fails, stop and report it before running the full script.

| Smoke | Step                                                       | What it proves                                 |
| ----- | ---------------------------------------------------------- | ---------------------------------------------- |
| S1    | [2](#2--start-talking) · Start talking                     | Voice onboarding greets and listens            |
| S2    | [13](#13--drop-a-pin) · Drop a pin                         | In-chat map works with real GPS                |
| S3    | [15](#15--open-the-shop-and-hand-off-to-google-maps)       | Shop opens; Google Maps hand-off works         |
| S4    | [16](#16--today-with-a-filled-shop) · Today                | Greeting, "Needs you now", pulse               |
| S5    | [19](#19--today-shrinks-to-a-pill-while-chatting) · Pill   | Today collapses while chatting                 |
| S6    | [21](#21--shop-tab) · Shop tab                             | New tab layout: Shop / Grow / You              |
| S7    | [27](#27--voice-and-captions-in-step) · Voice sync         | Captions follow the audio; barge-in stops both |
| S8    | [35](#35--verify-its-you) · Verify it's you                | Face check and verified badge                  |
| S9    | [39](#39--ask-the-shop-an-instant-answer) · Instant answer | Customer chat answers from the menu            |
| S10   | [44](#44--ask-the-ai-front-door) · AI front door           | Customer answers in under a second             |
| S11   | [46](#46--scan-the-counter-qr-stamp-and-scratch-card)      | QR stamp and scratch card                      |
| S12   | [49](#49--hindi-owner) + [50](#50--tamil-customer)         | Owner app in Hindi; customer content in Tamil  |

---

## Part 1 · Voice onboarding (owner)

#### 1 · Open the onboarding

- ☐ Pass ☐ Fail
- **Do:** Open the owner app and tap **+** in the top bar ("Add shop details").
- **See:** Full-screen "Let’s open your shop" with a **Let’s begin** button. No pop-up form.

#### 2 · Start talking

- ☐ Pass ☐ Fail
- **Do:** Tap **Let’s begin** and allow the microphone.
- **See:** The coach speaks first in a natural female voice with captions. The orb reads
  "Listening… just talk" and the "Your shop so far" card is at the top.

#### 3 · The shop card fills as you talk

- ☐ Pass ☐ Fail · _live only_
- **Do:** Say "I sell sourdough bread and filter coffee".
- **See:** The orb moves with your voice. "Your shop so far" adds both items, and the coach
  asks the next question.

#### 4 · Silence

- ☐ Pass ☐ Fail · _live only_
- **Do:** Stay silent for 15 seconds after the coach's question.
- **See:** The coach follows up once or offers a default and moves on. No freeze and no repeated
  prompt loop.

#### 5 · Interrupt the coach

- ☐ Pass ☐ Fail · _live only_
- **Do:** While the coach is talking, say "Wait, our shop name is Sunrise Bakery!".
- **See:** The voice stops at once and the captions stop with it. The card shows "Sunrise
  Bakery".

#### 6 · Pause and resume the mic

- ☐ Pass ☐ Fail
- **Do:** Tap the big mic button (**Pause the mic**), say something, then tap it again.
- **See:** "Mic paused" while paused, and nothing you say is sent. It returns to "Listening… just
  talk" after the second tap.

#### 7 · Microphone blocked

- ☐ Pass ☐ Fail
- **Do:** In the browser's site settings, set Microphone to **Block** and return to the tab.
- **See:** An inline alert, "Your microphone is blocked", with **Try again** and **Type
  instead**. Typing still works.

#### 8 · Microphone allowed again

- ☐ Pass ☐ Fail
- **Do:** Set Microphone back to **Allow** and tap **Try again**.
- **See:** The alert goes away, the orb listens again and the coach answers your voice.

#### 9 · Network drop

- ☐ Pass ☐ Fail
- **Do:** Turn on Airplane mode for 10 seconds while the session is connected.
- **See:** "Reconnecting…", then a "Connection lost" alert with **Reconnect**. The chat and the
  shop card stay.

#### 10 · Network back

- ☐ Pass ☐ Fail
- **Do:** Turn off Airplane mode, tap **Reconnect** and say "I am back".
- **See:** The same conversation carries on. It does not restart from step 1.

## Part 2 · Camera, map pin and Google Maps inside the chat (owner, new)

#### 11 · Camera in the chat

- ☐ Pass ☐ Fail
- **Do:** Tap **Menu photo**, then **Open camera** and allow the camera.
- **See:** A "Show me your price board · Photo 1 of 2" card with a live viewfinder inside the
  chat. The mic controls stay below it. ([06-camera](manual-v2/06-camera.png))

#### 12 · Read the price board

- ☐ Pass ☐ Fail · _live only_
- **Do:** Point at a printed menu or price board and take the photo.
- **See:** Items and prices appear in "Your shop so far". Nothing is saved until you open the
  shop.

#### 13 · Drop a pin

- ☐ Pass ☐ Fail
- **Do:** Tap **My location** and allow location. Drag the map until the pin sits on your door.
- **See:** A "Where is your shop?" map card with "Near <area>" and "within N m". **Bigger map**
  opens a full-screen map. ([07-map-pin](manual-v2/07-map-pin.png))

#### 14 · Save the pin

- ☐ Pass ☐ Fail
- **Do:** Tap **This is my shop**.
- **See:** The chat confirms "Saved your location: …" and the card chip shows the area.

#### 15 · Open the shop and hand off to Google Maps

- ☐ Pass ☐ Fail
- **Do:** Tap **Review my shop**, then **Open my shop**. On "Your shop is ready", tap **Open
  Google Maps**.
- **See:** Google Maps opens at your pin with the 3 steps (Copy details, Open Google Maps, "Add a
  missing place"). Come back and tap **Continue with my shop** to reach the Coach tab.

## Part 3 · Today page (owner, new)

#### 16 · Today with a filled shop

- ☐ Pass ☐ Fail
- **Do:** Tap **You → Take the tour**, then **Skip**, then the **Coach** tab. This makes a
  private demo shop, "(Tour)", with six weeks of sales.
- **See:** "Good morning/afternoon/evening", a **Needs you now** card with at most 3 rows and
  only one filled button, and a pulse card such as "Yesterday: ₹15,040 · Today: about 44 Filter
  coffee, busiest 12 – 2 PM". ([01-today](manual-v2/01-today.png))

#### 17 · Clear a row

- ☐ Pass ☐ Fail
- **Do:** On "Still the same menu today?", tap **Yes**.
- **See:** The row leaves with a check and the next one moves up.

#### 18 · Tap the pulse

- ☐ Pass ☐ Fail
- **Do:** Tap the pulse card.
- **See:** The coach is asked "How did yesterday go?" and replies. With live Gemini the reply has
  a "This week" chart card.

#### 19 · Today shrinks to a pill while chatting

- ☐ Pass ☐ Fail
- **Do:** Type any message and send it. Then tap the pill under the top bar.
- **See:** The Today card becomes a slim "N things need you" pill. Tapping it opens the same rows
  and **Hide** closes them. ([02-pill](manual-v2/02-pill.png))

#### 20 · Day one for a new shop

- ☐ Pass ☐ Fail
- **Do:** Switch to the shop from Part 2 using the shop name in the top bar.
- **See:** A "Shop setup n/6" bar and "Let’s get <shop> online" with the next step and **Talk
  to me**. No empty numbers are shown.

## Part 4 · Tabs: Coach, Shop, Grow, You (owner, new)

#### 21 · Shop tab

- ☐ Pass ☐ Fail
- **Do:** Tap **Shop**.
- **See:** "This is your page" leads, with a Shared/Not shared chip, **Share page** or **Turn on
  your page**, and **Customer page**. Then the Menu, Sold out today, Shop details, Photos and
  Messages tiles. ([03-shop](manual-v2/03-shop.png))

#### 22 · Grow tab

- ☐ Pass ☐ Fail
- **Do:** Tap **Grow**.
- **See:** Tool cards: Close the day (first after 5 pm), Prep plan, Orders, Plan tomorrow, Rescue
  deals, Asked nearby, Get on Google (with "n details missing" or "Ready to list") and Stamps &
  perks. ([04-grow](manual-v2/04-grow.png))

#### 23 · You tab

- ☐ Pass ☐ Fail
- **Do:** Tap **You**.
- **See:** Your shop's profile, the **Verify it’s you** card, Settings (Language, Look, Coach
  voice), Your shops, Privacy & your data, and Help (Take the tour, Install app). There is no
  gear icon in the top bar. ([05-you](manual-v2/05-you.png))

#### 24 · Privacy sub-page and Back

- ☐ Pass ☐ Fail
- **Do:** Tap **Privacy & your data**, then press the phone's Back.
- **See:** The Privacy page shows the agreement, face check, reviews and "Delete all my data".
  Back returns to **You** and stays in the app.

## Part 5 · Coach voice (owner)

#### 25 · Spoken reply

- ☐ Pass ☐ Fail · _live only_
- **Do:** On Coach, tap the mic (**Press to talk**) and ask "How can I prepare for the morning
  rush?".
- **See:** The reply streams as text and is spoken in the same natural female voice.

#### 26 · Mute

- ☐ Pass ☐ Fail
- **Do:** While the coach is speaking, tap **Mute spoken reply**. Then switch **You → Coach
  voice → Read replies aloud** off and on.
- **See:** The audio stops at once. With the setting off, replies are text only. With it on,
  they are spoken again.

#### 27 · Voice and captions in step

- ☐ Pass ☐ Fail · _live only_
- **Do:** Tap **Press to talk** and ask "How did this week go?". Watch the words, then speak over
  the coach halfway through.
- **See:** Words appear as they are spoken, not all at once, and the chart card appears when the
  voice reaches it. When you interrupt, the voice and the words stop together, and the text keeps
  only what was said.

#### 28 · Reload keeps the conversation

- ☐ Pass ☐ Fail
- **Do:** Reload the page on Coach, wait 2 seconds and tap **Press to talk**.
- **See:** The mic joins the restored conversation. No duplicate or blank thread.

## Part 6 · Photos, files and Close the day (owner)

#### 29 · Menu from a photo

- ☐ Pass ☐ Fail · _live only_
- **Do:** **Shop → Menu → Import → Take photo** and photograph a printed menu.
- **See:** "Check before saving" lists the items and prices, with edit and remove controls.
  Nothing saves until you confirm.

#### 30 · Confirm the menu

- ☐ Pass ☐ Fail
- **Do:** Tap **Confirm and save**.
- **See:** The items appear in the Menu tile and on the customer page.

#### 31 · Menu from Excel, CSV or PDF

- ☐ Pass ☐ Fail
- **Do:** **Shop → Menu → Import → Upload file**, then pick a `.xlsx` or `.csv` file, and then
  a `.pdf`.
- **See:** A preview with the right Name/Price/Category columns and an item count, shown before
  anything is saved.

#### 32 · Shopfront photo to the gallery

- ☐ Pass ☐ Fail · _live only_
- **Do:** On Coach, tap the paperclip, choose **Photo library** and pick a storefront photo.
  Then tap **Add to gallery**.
- **See:** A crisp preview in the chat, and the photo shows on the customer page gallery.

#### 33 · Close the day: till report

- ☐ Pass ☐ Fail · _live only_
- **Do:** **Grow → Close the day → Till or POS report** and photograph a till slip.
- **See:** The totals and items read from the paper. Nothing is saved yet.

#### 34 · Close the day: stock and one save

- ☐ Pass ☐ Fail · _live only_
- **Do:** Tap **Add more → Stock count**, take a photo, then **Review (n lines) → Save day**.
- **See:** One review shows sales and stock together. **Save day** shows "Day closed".

## Part 7 · Trust: Verify it's you (owner and customer, new)

#### 35 · Verify it's you

- ☐ Pass ☐ Fail
- **Do:** **You → Verify it’s you**, tick the consent box, tap **Open camera** and follow the
  two head movements for about 8 seconds.
- **See:** "You’re verified" and **Done**. The You card shows "Verified owner · Checked on
  <date>".

#### 36 · Verified badge on the customer page

- ☐ Pass ☐ Fail
- **Do:** Open your customer page on the second phone and tap **Verified owner** under the
  name.
- **See:** A note says it was an optional live face check and "not proof of business
  ownership". ([08-verified-badge](manual-v2/08-verified-badge.png))

#### 37 · Delete face data

- ☐ Pass ☐ Fail
- **Do:** **You → Privacy & your data → Delete face data → Delete**.
- **See:** "Face data deleted". The card returns to "Optional" and the shop stays.

## Part 8 · Customer page, chat and the AI front door

#### 38 · Open the customer page

- ☐ Pass ☐ Fail
- **Do:** **Shop → Customer page**, switch **Share customer page** on, then tap **Open page**.
- **See:** The shop name, facts (halal, payments), menu with prices, the stamp card and a **Chat
  with the shop** bar. No stock counts are shown.

#### 39 · Ask the shop: an instant answer

- ☐ Pass ☐ Fail
- **Do:** Tap **Chat with the shop**, then the **Price** chip (or type "What sourdough do you
  have?").
- **See:** An answer from the menu with the item and price, marked "Instant answer · Answer
  based on the shop's listed details".

#### 40 · Ask the owner needs sign-in

- ☐ Pass ☐ Fail
- **Do:** Tap **Ask the owner**.
- **See:** "Owners reply to a real person, so messages need a Google account…" and **Continue
  with Google**.

#### 41 · Send a message

- ☐ Pass ☐ Fail
- **Do:** Sign in, type "Can I reserve two loaves for tomorrow 10am?" and tap **Send message**.
- **See:** The thread opens at `/explore/chats/…` with "Sent. The owner replies here, usually
  within the day."

#### 42 · The owner replies

- ☐ Pass ☐ Fail
- **Do:** On the owner phone, open **Coach**, then **Shop → Messages (1) → Open conversation**.
  Reply "Yes, reserved for you!" and tap **Send message**.
- **See:** Today shows "1 customer is waiting · Reply". The thread shows the customer's name and
  exact question.

#### 43 · The customer sees the reply

- ☐ Pass ☐ Fail
- **Do:** Look at the customer thread without reloading.
- **See:** "Owner: Yes, reserved for you!" appears within a few seconds.

#### 44 · Ask the AI front door

- ☐ Pass ☐ Fail
- **Do:** Open `https://chalkboard.shreyaan.work/explore`, allow location and ask "chai" (or
  tap a chip).
- **See:** "Understanding what you need…" shows briefly, then in about a second cards with the
  exact item, price and distance, a small map, and follow-ups (Cheaper? Open now? Near a
  station?). ([10-customer-answer](manual-v2/10-customer-answer.png))

#### 45 · Back keeps the conversation

- ☐ Pass ☐ Fail
- **Do:** Tap a card, then **Back**.
- **See:** You return to the same question and answer, not to an empty screen.

## Part 9 · Stamps and games (customer, new)

#### 46 · Scan the counter QR: stamp and scratch card

- ☐ Pass ☐ Fail
- **Do:** Owner: **Shop → Customer page → Thank-you perks**, fill "A scratch-card prize" and tap
  **Save perks**. Customer: at the shop, signed in and with location on, scan the QR from that
  sheet.
- **See:** "First try! +50 points", then a "Scratch here" card. Rub it or tap **Reveal** to see
  the prize. The card shows 3 of 10 stamps (2 are welcome stamps).
  ([09-stamp-scratch](manual-v2/09-stamp-scratch.png))

#### 47 · One stamp a day

- ☐ Pass ☐ Fail
- **Do:** Scan the same QR again.
- **See:** "Already stamped today · Come back tomorrow". The count does not change.

#### 48 · Passport and streak freeze

- ☐ Pass ☐ Fail
- **Do:** Open **Passport** and tap **Freeze next week** under Weekly streak.
- **See:** "Next week is frozen. Enjoy the break!" and the freezes count drops by one. The
  points, next reward, neighbourhood goal and collection sets all show.

## Part 10 · Languages, theme and install

#### 49 · Hindi owner

- ☐ Pass ☐ Fail
- **Do:** **You → Language → हिन्दी**, then open **Coach**.
- **See:** The greeting ("शुभ संध्या"), Today rows and tabs (कोच · दुकान · बढ़ाएँ · आप) are in
  Hindi, with no clipped text. ([12-hindi-today](manual-v2/12-hindi-today.png))

#### 50 · Tamil customer

- ☐ Pass ☐ Fail
- **Do:** Set the customer phone's language to Tamil and open the shop's customer page.
- **See:** The category, menu sections and buttons are in Tamil. Item names stay exactly as the
  owner typed them, and nothing scrolls sideways. ([11-tamil-shop](manual-v2/11-tamil-shop.png))

#### 51 · Dark mode

- ☐ Pass ☐ Fail
- **Do:** Owner: **You → Look → Dark**, then visit Coach, Shop and Grow. Customer: tap the moon
  icon.
- **See:** Readable text everywhere, no white boxes, and the orb and cards follow the theme.

#### 52 · Install is optional

- ☐ Pass ☐ Fail
- **Do:** **You → Help → Install app**, then dismiss the prompt.
- **See:** The app keeps working in the browser and nothing blocks it.

---

## What changed from v1 (37 steps)

- **Renamed**: "My shop" is now **Shop**, tools moved to **Grow**, and Settings and Privacy moved
  to **You** (the top-bar gear is gone). Close the day is on **Grow**. "Review" is now **Review
  my shop**. "Open customer page" is now **Customer page → Open page**.
- **Moved**: Pause/resume mic (old 15) is now step 6, next to the other onboarding voice steps.
- **Removed**:
  - Old 10, voice rate limit: a tester can't trigger it. It's covered by
    `tests/new-shop-voice.spec.ts`.
  - Old 17, conversation full: it needs hundreds of turns, so step 28 now checks the reload part
    only.
  - Old 32, typing `?source=qr`: the printed QR now carries a signed key, so a hand-typed
    `?source=qr` no longer stamps. Step 46 scans the real QR instead.
  - Old 34, claim reward: a full card takes 8 visit days. It's covered by
    `tests/bugs-b30-b31.spec.ts`.
- **Updated**: the first QR scan now shows 3 of 10 stamps (2 welcome stamps plus 1), not "1
  stamp".
- **Added**: in-chat camera, map pin and Google Maps (11–15), Today (16–20), tabs (21–24),
  caption sync (27), trust (35–37), AI front door (44–45), games (46–48), Hindi and Tamil
  (49–50).

## How this script was checked

On `7349b1f` locally, with `npm run dev`, the offline backend (WEB_PORT 3803, API_PORT 3903),
a 360×800 touch viewport and the tour demo seed (`POST /api/v1/demo/workspace`). A throwaway
Playwright walk drove every step marked without _live only_, and every label above was read from
the running app. Existing specs `voice-sync`, `new-shop-voice` and `today` passed on the phone
project (40 passed, one worker). This is browser emulation, not a physical phone. Live Gemini,
real ASR, real camera reading and hosted sign-in were not exercised.

Seen during the local run (not fixed here; this PR only changes docs):

- On a 360×800 screen, the voice stage covers the bottom of the in-chat map card. You have to
  scroll the chat to reach **This is my shop** (see 07-map-pin).
- The customer front door's placeholder says "coffee under $3" even for an Indian (₹) phone.
- Today can briefly show the day-one card ("Add your menu") for a filled shop before its data
  loads.
- In one local run, Passport's "Regulars this week" showed "Couldn’t complete that request"
  for a signed-in customer with location off.

---

## Run summary

- **Steps**: 52 (about 45 minutes), or the smoke 12 (about 15 minutes)
- **Device**: `[ Android Chrome / iOS Safari ]`
- **Result**: `[ PASS / FAIL ]`
- **Blocking issues**: (step numbers and what you saw)
