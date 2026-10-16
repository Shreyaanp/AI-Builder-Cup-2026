# Owner Phone Manual Test Script

**Verified against main at 6944987709dbf262002a209fb6e933cba186dea6**

**Scope**: 20-minute end-to-end verification run on a physical mobile phone (Chrome on Android or Safari on iOS).  
**Live Sites**:
- Owner app: `https://business.chalkboard.shreyaan.work`
- Customer app: `https://chalkboard.shreyaan.work`

**Rules for Tester**:
- Follow steps in exact order.
- Test using physical phone hardware (real microphone, camera/photo picker, touch gestures, network toggle).
- Report any step where actual behaviour does not match the **Expected (Pass)** criteria.
- Mark each ☐ checkbox upon completing and verifying each step.

---

## Part 1 · Voice-Mode Onboarding & Resilience (Steps 1–11)
*Target: Owner App (`https://business.chalkboard.shreyaan.work`)*

### Step 1 · Open app & launch onboarding hero
- [ ] ☐
- **Action**: Open `https://business.chalkboard.shreyaan.work` in your mobile browser. Tap the **"+"** button in the header (or "Add shop details" / "Create your shop").
- **Say / Upload**: None.
- **Expected (Pass)**: Full-screen hero titled "Let’s open your shop" with animated chalk shop drawing and a prominent "Let’s begin" button with a microphone icon. No modal popups or raw forms.
- **Counts as Fail**: Opening a traditional pop-up form, layout overflow, or missing "Let’s begin" button.

### Step 2 · Mic permission & female voice greeting
- [ ] ☐
- **Action**: Tap **"Let’s begin"**. When the browser prompts for microphone access, tap **Allow**.
- **Say / Upload**: Listen to the coach.
- **Expected (Pass)**: The reactive Voice Orb turns active. The coach speaks first aloud in a clear, natural female voice (Gemini Achernar) asking about your shop/products (with live captions displayed on screen). The orb status displays "Listening… just talk" with the mic remaining continuously active.
- **Counts as Fail**: Robotic system voice, silent start without speaking, coach waiting for user to initiate, or mic immediately pausing.

### Step 3 · Natural conversation & shop card filling
- [ ] ☐
- **Action**: Speak clearly into the phone.
- **Say / Upload**: "I sell sourdough bread and filter coffee"
- **Expected (Pass)**: While speaking, the Voice Orb ripples with voice input levels. The coach acknowledges what you sell and asks the next question (business name or location). "Your shop so far" card updates dynamically with products ("sourdough bread", "filter coffee") showing animated chalk styling.
- **Counts as Fail**: Orb doesn't respond to audio levels, speech is ignored, or the shop card does not update with mentioned items.

### Step 4 · Silence handling
- [ ] ☐
- **Action**: Stay completely silent when the coach finishes asking the next question. Wait for 10–15 seconds.
- **Say / Upload**: Nothing (silence).
- **Expected (Pass)**: The coach does not hang or crash. After ~9 seconds of silence, it politely follows up or offers a sensible default/alternative in chat and moves the conversation forward without getting stuck.
- **Counts as Fail**: Infinite silence, app freeze, disconnect error, or coach looping the identical prompt repeatedly.

### Step 5 · Barge-in / Interrupting the coach
- [ ] ☐
- **Action**: When the coach starts speaking its reply aloud, immediately speak over it loudly.
- **Say / Upload**: "Wait, our shop name is Sunrise Bakery!"
- **Expected (Pass)**: The coach audio immediately cuts off / stops playback (echo cancellation & barge-in detected) and switches to listening/processing your interruption. The shop name updates to "Sunrise Bakery".
- **Counts as Fail**: Coach talks over you to the end of its sentence, ignores your speech, or crashes the audio session.

### Step 6 · Microphone blocked alert & recovery
- [ ] ☐
- **Action**: Tap browser permissions (lock icon in URL bar) -> Permissions -> set Microphone to **Block** (or deny mic). Return to tab or tap voice retry.
- **Say / Upload**: None.
- **Expected (Pass)**: Inline warning banner appears: **"Your microphone is blocked"** ("To talk, allow the microphone for this site: tap the lock icon...") with buttons **"Try again"** and **"Type instead"**. No full-screen blocking modal; typing input remains accessible.
- **Counts as Fail**: Silent crash, blank screen, infinite loading spinner, or no "Type instead" escape hatch.

### Step 7 · Re-enabling microphone
- [ ] ☐
- **Action**: Tap the lock icon in the URL bar, switch Microphone back to **Allow**, return to tab and tap **"Try again"**.
- **Say / Upload**: "Can you hear me now?"
- **Expected (Pass)**: The alert dismisses, Voice Orb re-connects and returns to "Listening… just talk" mint state, and coach responds to your voice.
- **Counts as Fail**: Alert stays stuck, microphone fails to re-acquire stream, or page refresh is forcibly required.

### Step 8 · Network drop resilience
- [ ] ☐
- **Action**: While the voice session is connected, swipe down phone quick settings and toggle **Airplane Mode ON** (or disconnect Wi-Fi and mobile data). Wait 5 seconds.
- **Say / Upload**: None.
- **Expected (Pass)**: The Voice Orb indicates reconnecting state; an alert appears: **"Connection lost"** with a **"Reconnect"** button and "Type instead" option. The chat history and "Your shop so far" progress remain intact.
- **Counts as Fail**: Erased draft, crash to blank screen, or losing all existing conversation messages.

### Step 9 · Network restoration & session resumption
- [ ] ☐
- **Action**: Toggle **Airplane Mode OFF** (reconnect mobile data/Wi-Fi). Tap **"Reconnect"**.
- **Say / Upload**: "I am back"
- **Expected (Pass)**: Re-establishes WebSocket session smoothly. Coach acknowledges resumption with the same session context preserved.
- **Counts as Fail**: Starting completely over from Step 1, or repeated failure to connect despite active internet.

### Step 10 · Voice rate limit handling
- [ ] ☐
- **Action**: If high volume occurs or simulated limit triggers (or verify message copy when busy).
- **Say / Upload**: Rapid voice turns.
- **Expected (Pass)**: If session limit is reached, a calm banner displays: **"Voice is busy"** ("Too many voice sessions just now. Try again in X s, or type meanwhile.") with active countdown timer and "Type instead" option.
- **Counts as Fail**: Unhandled 429/500 JSON dump, frozen button, or uncaught exception.

### Step 11 · Complete shop onboarding & review
- [ ] ☐
- **Action**: State or type location ("Indiranagar 100ft Road") and tap **"Review"** -> review shop card -> tap **"Open my shop"**.
- **Say / Upload**: None.
- **Expected (Pass)**: Review screen displays shop name, products, prices, and location. Tapping "Open my shop" celebrates with "Your shop is ready" and "Continue with my shop" lands on the owner dashboard.
- **Counts as Fail**: Missing review step, unconfirmed data overwrite, or failure to persist shop.

---

## Part 2 · Coach Spoken Replies, Continuity & Chart Cards (Steps 12–17)
*Target: Owner App Dashboard (`https://business.chalkboard.shreyaan.work`)*

### Step 12 · Spoken coach response
- [ ] ☐
- **Action**: In the Coach tab, tap the mic button ("Press to talk") or type: "How can I prepare for morning rush?" and tap Send.
- **Say / Upload**: "How can I prepare for morning rush?"
- **Expected (Pass)**: Coach reply streams in text and simultaneously speaks aloud in the female Achernar voice using Cloud TTS.
- **Counts as Fail**: Text streams but audio remains silent (when unmuted), or audio uses poor default robotic phone synthesizer.

### Step 13 · Mute coach voice
- [ ] ☐
- **Action**: While the coach is speaking (or during voice interaction), tap the **Mute** (speaker icon) button in the composer bar.
- **Say / Upload**: None.
- **Expected (Pass)**: Spoken audio cuts out immediately. Future replies generate text only without audio playback until unmuted. Speaker icon visually toggles to muted state.
- **Counts as Fail**: Audio continues playing in background despite mute toggle.

### Step 14 · Unmute & voice continuity
- [ ] ☐
- **Action**: Tap the **Unmute** button. Ask: "Give me one quick tip."
- **Say / Upload**: "Give me one quick tip."
- **Expected (Pass)**: Coach speaks the tip out loud with natural inflection and matching text.
- **Counts as Fail**: Unmute fails to restore sound on subsequent answers.

### Step 15 · Pause & resume mic (Onboarding voice mode)
- [ ] ☐
- **Action**: In voice mode during onboarding, tap the central mic button (**"Pause the mic"**).
- **Say / Upload**: "Can you hear this?"
- **Expected (Pass)**: Orb switches to paused state (mic slash icon), input audio level stays zero, no message is sent. Tap the mic button again (**"Resume the mic"**); orb returns to mint listening state.
- **Counts as Fail**: Mic continues recording while paused or fails to resume.

### Step 16 · Coach forecast & insights chart cards
- [ ] ☐
- **Action**: In the Coach tab, type or speak: "Analyse my forecast for next week" (or "How is business this week?"). Tap Send.
- **Say / Upload**: "Analyse my forecast for next week"
- **Expected (Pass)**: Coach responds with text analysis accompanied by an interactive chalk-style chart card: for forecast, displays "Next 7 days" with likely range lines and item projections; for sales, displays "This week" vs last week with animated bars and top sellers.
- **Counts as Fail**: Raw text only without chart card, broken SVG canvas, or missing accessible data table.

### Step 17 · Voice continuity across reload & conversation rollover
- [ ] ☐
- **Action**: Reload the browser page while on the Coach screen. Wait 2 seconds for history restoration, then tap the mic button ("Press to talk").
- **Say / Upload**: "What was the last thing we talked about?"
- **Expected (Pass)**: Mic joins the restored conversation without starting a duplicate thread. When conversation reaches capacity, coach announces: "This conversation is full. I started a new conversation so we can continue." and rolls over smoothly.
- **Counts as Fail**: Starting an unlinked blank session, crash on reload, or unhandled 400 error on cap limit.

---

## Part 3 · Visual Intake: Photos, Documents & Day Close (Steps 18–25)
*Target: Owner App -> My shop & Tools*

### Step 18 · Menu photo upload -> Menu extraction
- [ ] ☐
- **Action**: Go to **My shop** -> tap the **Menu** tile -> tap **"Import"** -> tap **"Take photo"** (or in Coach tap Paperclip -> "Photo library"). Snap or upload a photo of a printed menu or chalk blackboard.
- **Say / Upload**: Photo of a menu with dish names and prices.
- **Expected (Pass)**: Upload indicator shows progress ("Checking your photo…"). Gemini extracts items and prices into a sealed proposal sheet with exact currency. Items are listed for owner review with clear edit/remove controls before saving.
- **Counts as Fail**: Uploading auto-saves without owner confirmation, wrong prices extracted without uncertainty flag, or non-image files accepted without error.

### Step 19 · Confirm extracted menu
- [ ] ☐
- **Action**: Review extracted items, check prices, and tap **"Confirm and save"** (or Approve).
- **Say / Upload**: None.
- **Expected (Pass)**: Confirmed items immediately appear in your shop's live inventory list.
- **Counts as Fail**: Saved items fail to show up in menu list or prices get truncated.

### Step 20 · Shopfront photo upload
- [ ] ☐
- **Action**: In Coach chat, tap the Paperclip icon -> choose **"Photo library"** (or "Take photo"). Select an exterior storefront photo showing shop signboard.
- **Say / Upload**: Storefront photo.
- **Expected (Pass)**: Image passes SafeSearch moderation check, displays as a crisp preview thumbnail in chat, and suggests shop name or category if signboard text was detected.
- **Counts as Fail**: Upload fails silently, blurry uncapped image breaks layout, or inappropriate content passes moderation.

### Step 21 · Gallery photo upload
- [ ] ☐
- **Action**: After uploading a shop photo, inspect the banner: "Add to customer gallery?". Tap **"Add to gallery"**.
- **Say / Upload**: None.
- **Expected (Pass)**: Photo is confirmed and added to the shop gallery. Future customer storefront loads the photo in the gallery showcase.
- **Counts as Fail**: Photo fails to upload or distorts aspect ratio.

### Step 22 · Close the day: Till report photo
- [ ] ☐
- **Action**: In **My shop**, tap the **"Close the day"** tile (Moon icon). Select **"Till or POS report"** photo. Upload photo of a register receipt or Z report.
- **Say / Upload**: Receipt photo showing total sales figures.
- **Expected (Pass)**: Backend reads lines via `/day/read`. Shows parsed sales totals and item counts in a sealed proposal for today's date.
- **Counts as Fail**: Crash on receipt scan, invented numbers not on paper, or instant saving without review.

### Step 23 · Close the day: Stock count photo & single-tap save
- [ ] ☐
- **Action**: In the same Close the day dialog, tap **"Add more"** -> select **"Stock count"** photo: upload handwritten stock notes or inventory sheet. Tap **"Review (X lines)"** -> tap **"Save day"**.
- **Say / Upload**: Photo of stock count notes.
- **Expected (Pass)**: Combined review shows both daily revenue and stock adjustments together. Tapping **"Save day"** displays celebration check animation and "Day closed" summary.
- **Counts as Fail**: Double-counting sales or separate uncoordinated saves requiring repeated taps.

### Step 24 · Excel / CSV menu import
- [ ] ☐
- **Action**: In **My shop** -> **Menu** tile -> tap **"Import"** -> tap **"Upload file"**, select a `.xlsx` or `.csv` spreadsheet file with columns (Item, Price, Category).
- **Say / Upload**: Sample Excel file (`menu.xlsx` or `.csv`).
- **Expected (Pass)**: Smart column mapper accurately identifies Name, Price, and Category columns without hard-coded schema. Preview dialog shows parsed rows and total item count before saving.
- **Counts as Fail**: Fails on Excel binary format, misaligns columns, or saves without owner confirmation.

### Step 25 · PDF menu import
- [ ] ☐
- **Action**: In **My shop** -> **Menu** tile -> tap **"Import"** -> tap **"Upload file"**, choose a PDF document menu (`.pdf`).
- **Say / Upload**: Sample PDF menu.
- **Expected (Pass)**: File is parsed cleanly; items and prices appear in the proposal dialog for review before insertion.
- **Counts as Fail**: Rejection of `.pdf` extension or corrupted character encoding in item names.

---

## Part 4 · Customer Experience: Shop Chat, Order Messages & QR Stamps (Steps 26–34)
*Target: Customer App (`https://chalkboard.shreyaan.work` or `/s/{shopId}`)*

### Step 26 · Open public shop page
- [ ] ☐
- **Action**: In owner app, tap **My shop** -> **Customer page** tile -> tap **"Open customer page"** (or open `https://chalkboard.shreyaan.work/s/<your-shop-id>`).
- **Say / Upload**: None.
- **Expected (Pass)**: Flashy, vibrant customer storefront loads with shop name, verified badge/status, opening hours, story quote, and menu categories. No private inventory stock counts are visible to customers.
- **Counts as Fail**: Blank page, raw internal stock numbers displayed, or missing shop name.

### Step 27 · Customer instant AI ask
- [ ] ☐
- **Action**: Tap the **"Chat with the shop"** bottom bar. In the question box, tap a suggestion chip ("Hours", "Location", or "Price") or type: "What sourdough do you have?". Tap the Send arrow.
- **Say / Upload**: "What sourdough do you have?"
- **Expected (Pass)**: AI assistant replies instantly from the shop's listed menu details with item name, price, and note "Instant answer · Answer based on the shop's listed details".
- **Counts as Fail**: Generic "I don't know", hallucinated items outside the menu, or error bubble.

### Step 28 · Ask the owner (Authenticated thread handoff)
- [ ] ☐
- **Action**: Below the assistant's instant answer, tap the **"Ask the owner"** button.
- **Say / Upload**: None.
- **Expected (Pass)**: Sheet reveals Google sign-in prompt explaining: "Sign in with Google to message this shop. Owners reply to a real person." Anonymous spam messages are prevented.
- **Counts as Fail**: Anonymous customer can spam the owner directly without identity.

### Step 29 · Send message to owner
- [ ] ☐
- **Action**: Tap **"Continue with Google"** and sign in. In the message box, edit or enter: "Can I reserve two loaves for tomorrow 10am?" and tap **"Send message"**.
- **Say / Upload**: "Can I reserve two loaves for tomorrow 10am?"
- **Expected (Pass)**: Message delivers and view navigates directly into customer chat thread at `/explore/chats/<shopId>/...`.
- **Counts as Fail**: Message send fails, input clears without sending, or chat doesn't create thread.

### Step 30 · Owner receives and replies to customer message
- [ ] ☐
- **Action**: Switch back to Owner App (`business.chalkboard.shreyaan.work`). Tap **My shop** -> **Messages (1)** tile. Open the new conversation thread.
- **Say / Upload**: "Yes, reserved for you! See you at 10am."
- **Expected (Pass)**: Owner sees the customer's exact question and sender name. Typing a reply and tapping **"Send message"** delivers the reply.
- **Counts as Fail**: Message badge does not show count, thread is missing, or reply fails to submit.

### Step 31 · Customer receives owner reply live
- [ ] ☐
- **Action**: Switch to the customer phone screen on the chat thread.
- **Say / Upload**: None.
- **Expected (Pass)**: Owner's reply arrives in the thread (polling/stream) without needing full browser restart.
- **Counts as Fail**: Message never arrives or requires clearing cache to appear.

### Step 32 · Scan / Visit QR Stamp Card
- [ ] ☐
- **Action**: On customer phone, navigate to your shop URL with QR parameter: `https://chalkboard.shreyaan.work/s/<shopId>?source=qr`.
- **Say / Upload**: None.
- **Expected (Pass)**: Animated stamp moment triggers! A die-cut stamp card displays **"1 stamp"** marked for today with note "This card is stored on this phone" (or "This card is saved to your account" if signed in).
- **Counts as Fail**: Stamp does not increment, no visual reward animation, or crash on `?source=qr`.

### Step 33 · QR Stamp daily uniqueness & persistence
- [ ] ☐
- **Action**: Refresh the page or reopen `https://chalkboard.shreyaan.work/s/<shopId>?source=qr` again on the same day.
- **Say / Upload**: None.
- **Expected (Pass)**: Stamp count remains 1 (preventing multiple scans on same day). Stamp card state persists after page reload.
- **Counts as Fail**: Stamp resets to 0 or increments to 2 on repeat scan on the same day.

### Step 34 · Reward claim interaction
- [ ] ☐
- **Action**: When stamp card reaches the target threshold (e.g. 8 stamps), inspect the card for the **"Claim reward"** button. Tap it.
- **Say / Upload**: None.
- **Expected (Pass)**: Opens full-screen redemption sheet with live shop clock and button "Staff: mark as used".
- **Counts as Fail**: Button disabled when threshold met, or crashes upon redemption.

---

## Part 5 · Theme & Language Wrap-up (Steps 35–37)
*Target: Customer & Owner App Settings*

### Step 35 · Dark mode toggle across views
- [ ] ☐
- **Action**: In the top bar, tap the **Settings** (gear icon) -> under Theme, select **Dark**. Walk through Coach, My shop, and Customer views.
- **Say / Upload**: None.
- **Expected (Pass)**: High-contrast, pleasing dark chalk theme. Text remains legible, no unstyled white containers, Voice Orb colors adapt smoothly.
- **Counts as Fail**: Unreadable dark grey text on black, blinding white boxes in dark mode, or broken styling.

### Step 36 · Language switch (e.g. Hindi or Tamil)
- [ ] ☐
- **Action**: Open Settings -> Change Language to **हिंदी (Hindi)** or **தமிழ் (Tamil)**.
- **Say / Upload**: None.
- **Expected (Pass)**: UI labels, headers, Voice alerts, and stamp card switch cleanly to selected language without text clipping or overflowing screen edges.
- **Counts as Fail**: English strings remain everywhere, translated text overflows viewport, or broken fonts.

### Step 37 · PWA Installation check
- [ ] ☐
- **Action**: In browser menu or in-app settings, check "Install app" option.
- **Say / Upload**: None.
- **Expected (Pass)**: Web app continues operating without forcing an install. If install banner appears, dismissing it allows normal web use without blocking modals.
- **Counts as Fail**: Hard paywall or mandatory install gate preventing browser usage.

---

## Test Execution Summary Sheet
- **Total Steps**: 37 (Est. time: ~20 minutes)
- **Verified against main at commit**: `6944987709dbf262002a209fb6e933cba186dea6`
- **Device Tested**: `[ Android Chrome / iOS Safari ]`
- **Result**: `[ PASS / FAIL ]`
- **Blocking Issues**: (List step numbers and observed failures)
