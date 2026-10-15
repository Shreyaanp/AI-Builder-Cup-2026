# Owner Phone Manual Test Script

**Scope**: 20-minute end-to-end verification run on a physical mobile phone (Chrome on Android or Safari on iOS).  
**Live Sites**:
- Owner app: `https://business.chalkboard.shreyaan.work`
- Customer app: `https://chalkboard.shreyaan.work`

**Rules for Tester**:
- Follow steps in exact order.
- Test using physical phone hardware (real microphone, camera/photo picker, touch gestures, network toggle).
- Report any step where actual behaviour does not match the **Expected (Pass)** criteria.

---

## Part 1 · Voice-Mode Onboarding & Resilience (Steps 1–11)
*Target: Owner App (`https://business.chalkboard.shreyaan.work`)*

### Step 1 · Open app & launch onboarding hero
- **Action**: Open `https://business.chalkboard.shreyaan.work` in your mobile browser. Tap the **"+"** button in the header (or "Create your shop").
- **Say / Upload**: None.
- **Expected (Pass)**: Full-screen hero titled "Let’s open your shop" with chalk art animation and a prominent "Let’s begin" button. No modal popups or raw forms.
- **Counts as Fail**: Opening a traditional pop-up form, layout overflow, or missing "Let’s begin" button.

### Step 2 · Mic permission & female voice greeting
- **Action**: Tap **"Let’s begin"**. When the browser prompts for microphone access, tap **Allow**.
- **Say / Upload**: Listen to the coach.
- **Expected (Pass)**: The reactive Voice Orb turns active. The coach speaks first aloud in a clear, natural female voice (Gemini Achernar) asking what you sell (with live captions in the conversation log). The mic status switches to "Listening… just talk" with the mic remaining active.
- **Counts as Fail**: Robotic system voice, silent start without speaking, coach waiting for user to initiate, or mic immediately pausing.

### Step 3 · Natural conversation & shop card filling
- **Action**: Speak clearly into the phone.
- **Say / Upload**: "I sell sourdough bread and filter coffee"
- **Expected (Pass)**: While speaking, the Voice Orb ripples with voice input levels. The coach acknowledges what you sell and asks the next question (business name or location). "Your shop so far" card updates dynamically with products ("sourdough bread", "filter coffee") showing small stamp animations.
- **Counts as Fail**: Orb doesn't respond to audio levels, speech is ignored, or the shop card does not update with mentioned items.

### Step 4 · Silence handling
- **Action**: Stay completely silent when the coach finishes asking the next question. Wait for 10–15 seconds.
- **Say / Upload**: Nothing (silence).
- **Expected (Pass)**: The coach does not hang or crash. It politely follows up or offers a sensible default/alternative in chat and moves the conversation forward without getting stuck.
- **Counts as Fail**: Infinite silence, app freeze, disconnect error, or coach looping the identical prompt repeatedly.

### Step 5 · Barge-in / Interrupting the coach
- **Action**: When the coach starts speaking its reply aloud, immediately speak over it loudly.
- **Say / Upload**: "Wait, our shop name is Sunrise Bakery!"
- **Expected (Pass)**: The coach audio immediately cuts off / stops playback (echo cancellation & barge-in detected) and switches to listening/processing your interruption. The shop name updates to "Sunrise Bakery".
- **Counts as Fail**: Coach talks over you to the end of its sentence, ignores your speech, or crashes the audio session.

### Step 6 · Microphone blocked alert & recovery
- **Action**: Tap browser permissions (lock icon in URL bar) -> Permissions -> set Microphone to **Block** (or deny mic). Reload or tap voice retry.
- **Say / Upload**: None.
- **Expected (Pass)**: Inline warning banner appears: **"Your microphone is blocked"** with helpful guidance to tap the lock icon, and buttons **"Try again"** and **"Type instead"**. No full-screen blocking modal; typing input remains accessible.
- **Counts as Fail**: Silent crash, blank screen, infinite loading spinner, or no "Type instead" escape hatch.

### Step 7 · Re-enabling microphone
- **Action**: Tap the lock icon in the URL bar, switch Microphone back to **Allow**, return to tab and tap **"Try again"**.
- **Say / Upload**: "Can you hear me now?"
- **Expected (Pass)**: The alert dismisses, Voice Orb re-connects and returns to "Listening… just talk" mint state, coach responds to your voice.
- **Counts as Fail**: Alert stays stuck, microphone fails to re-acquire stream, or page refresh is forcibly required.

### Step 8 · Network drop resilience
- **Action**: While the voice session is connected, swipe down phone quick settings and toggle **Airplane Mode ON** (or disconnect Wi-Fi and mobile data). Wait 5 seconds.
- **Say / Upload**: None.
- **Expected (Pass)**: The Voice Orb indicates reconnecting state; an alert appears: **"Connection lost"** with a **"Reconnect"** button. The chat history and "Your shop so far" progress remain intact.
- **Counts as Fail**: Erased draft, crash to blank screen, or losing all existing conversation messages.

### Step 9 · Network restoration & session resumption
- **Action**: Toggle **Airplane Mode OFF** (reconnect mobile data/Wi-Fi). Tap **"Reconnect"**.
- **Say / Upload**: "I am back"
- **Expected (Pass)**: Re-establishes WebSocket session smoothly. Coach acknowledges resumption with the same session context preserved.
- **Counts as Fail**: Starting completely over from Step 1, or repeated failure to connect despite active internet.

### Step 10 · Voice rate limit handling
- **Action**: If high volume occurs or simulated limit triggers (or verify message copy when busy).
- **Say / Upload**: Rapid voice turns.
- **Expected (Pass)**: If session limit is reached, a calm banner displays: **"Voice is busy"** ("Too many voice sessions just now. Try again in X s, or type meanwhile") with active countdown timer and "Type instead" option.
- **Counts as Fail**: Unhandled 429/500 JSON dump, frozen button, or uncaught exception.

### Step 11 · Complete shop onboarding & review
- **Action**: Say or type location ("Indiranagar 100ft Road") and tap **"Review my shop"** -> **"Open my shop"**.
- **Say / Upload**: None.
- **Expected (Pass)**: Summary review screen displays shop name, products, location. Tapping "Open my shop" celebrates with "Your shop is ready" and lands on the owner dashboard.
- **Counts as Fail**: Missing review step, unconfirmed data overwrite, or failure to persist shop.

---

## Part 2 · Coach Spoken Replies & Voice Controls (Steps 12–15)
*Target: Owner App Dashboard*

### Step 12 · Spoken coach response
- **Action**: In the Coach tab, tap the mic button or type: "How can I prepare for morning rush?" and tap Send.
- **Say / Upload**: "How can I prepare for morning rush?"
- **Expected (Pass)**: Coach reply streams in text and simultaneously speaks aloud in the female Achernar voice using Cloud TTS.
- **Counts as Fail**: Text streams but audio remains silent (when unmuted), or audio uses poor default robotic phone synthesizer.

### Step 13 · Mute coach voice
- **Action**: While the coach is speaking, tap the **Mute** (speaker icon) button in the header/controls.
- **Say / Upload**: None.
- **Expected (Pass)**: Spoken audio cuts out immediately. Future replies generate text only without audio playback until unmuted. Mute icon visually toggles.
- **Counts as Fail**: Audio continues playing in background despite mute toggle.

### Step 14 · Unmute & voice continuity
- **Action**: Tap the **Unmute** button. Ask: "Give me one quick tip."
- **Say / Upload**: "Give me one quick tip."
- **Expected (Pass)**: Coach speaks the tip out loud with natural inflection and matching text.
- **Counts as Fail**: Unmute fails to restore sound on subsequent answers.

### Step 15 · Pause & resume mic
- **Action**: In voice mode / mic panel, tap **"Pause the mic"**.
- **Say / Upload**: "Can you hear this?"
- **Expected (Pass)**: Orb switches to paused state (mic slash icon), input audio level stays zero, no message is sent. Tap **"Resume the mic"**; orb turns mint and listens again.
- **Counts as Fail**: Mic continues recording while paused or fails to resume.

---

## Part 3 · Visual Intake: Photos, Documents & Day Close (Steps 16–23)
*Target: Owner App -> My shop & Tools*

### Step 16 · Menu photo upload -> Menu extraction
- **Action**: Go to **My shop** -> **Menu** -> **Add items** -> choose **Photo of menu/board**. Snap or upload a photo of a printed menu or chalk blackboard.
- **Say / Upload**: Photo of a menu with dish names and prices.
- **Expected (Pass)**: Upload indicator shows progress. Gemini extracts items and prices into a sealed proposal sheet with exact currency. Items are listed for owner review with clear edit/remove controls before saving.
- **Counts as Fail**: Uploading auto-saves without owner confirmation, wrong prices extracted without uncertainty flag, or non-image files accepted without error.

### Step 17 · Confirm extracted menu
- **Action**: Review extracted items, check prices, and tap **"Save to menu"** (or Approve).
- **Say / Upload**: None.
- **Expected (Pass)**: Confirmed items immediately appear in your shop's live inventory list.
- **Counts as Fail**: Saved items fail to show up in menu list or prices get truncated.

### Step 18 · Shopfront photo upload
- **Action**: Go to **My shop** -> **Shop details** (or Photo stage in onboarding) -> tap **"Shopfront photo"**. Take a photo of the exterior/storefront.
- **Say / Upload**: Storefront photo.
- **Expected (Pass)**: Image passes SafeSearch moderation check, displays as a crisp preview thumbnail, and suggests shop name or category if signboard text was detected.
- **Counts as Fail**: Upload fails silently, blurry uncapped image breaks layout, or inappropriate content passes moderation.

### Step 19 · Gallery photo upload
- **Action**: In **My shop**, find **Gallery** / photos section. Upload 1–2 photos of food/products.
- **Say / Upload**: Product photo.
- **Expected (Pass)**: Photos upload, resize client/server-side cleanly, and appear in the merchant gallery grid.
- **Counts as Fail**: Photo fails to upload or distorts aspect ratio.

### Step 20 · Close the day: Till report photo
- **Action**: Navigate to **Close the day** (or Coach -> "Close today"). Select **"Till receipt / sales report"** photo. Upload photo of a register receipt.
- **Say / Upload**: Receipt photo showing total sales figures.
- **Expected (Pass)**: Backend reads lines via `/day/read`. Shows parsed sales totals and item counts in a sealed proposal for today's date.
- **Counts as Fail**: Crash on receipt scan, invented numbers not on paper, or instant saving without review.

### Step 21 · Close the day: Stock count photo & single-tap save
- **Action**: Add a second photo for closing: handwritten stock notes or inventory sheet. Tap **"Prepare day summary"**.
- **Say / Upload**: Photo of stock count notes.
- **Expected (Pass)**: Combined review shows both daily revenue and stock adjustments together. One prominent **"Confirm & save today"** button commits the day's record.
- **Counts as Fail**: Double-counting sales or separate uncoordinated saves requiring repeated taps.

### Step 22 · Excel / CSV menu import
- **Action**: In **My shop** -> **Menu** -> **Import**, select a `.xlsx` or `.csv` spreadsheet file with columns (Item, Price, Category).
- **Say / Upload**: Sample Excel file (`menu.xlsx` or `.csv`).
- **Expected (Pass)**: Smart column mapper accurately identifies Name, Price, and Category columns without hard-coded schema. Preview dialog shows parsed rows and total item count.
- **Counts as Fail**: Fails on Excel binary format, misaligns columns, or saves without owner confirmation.

### Step 23 · PDF menu import
- **Action**: In **My shop** -> **Menu** -> **Import**, choose a PDF document menu.
- **Say / Upload**: Sample PDF menu.
- **Expected (Pass)**: File is parsed cleanly; items and prices appear in the proposal dialog for review before insertion.
- **Counts as Fail**: Rejection of `.pdf` extension or corrupted character encoding in item names.

---

## Part 4 · Customer Experience: Voice Ask, Chat & QR Stamps (Steps 24–32)
*Target: Customer App (`https://chalkboard.shreyaan.work` or `/s/{shopId}`)*

### Step 24 · Open public shop page
- **Action**: In owner app, tap **Share / View public shop** (or open `https://chalkboard.shreyaan.work/s/<your-shop-id>`).
- **Say / Upload**: None.
- **Expected (Pass)**: Flashy, vibrant customer storefront loads with shop name, verified badge/status, opening hours, and menu categories. No private inventory stock counts are visible to customers.
- **Counts as Fail**: Blank page, raw internal stock numbers displayed, or missing shop name.

### Step 25 · Customer AI ask by voice
- **Action**: Tap the **Ask assistant** mic icon on the customer shop page. Allow mic permission when prompted.
- **Say / Upload**: "Do you have vegetarian options?" (or "What sourdough do you have?")
- **Expected (Pass)**: Customer voice prompt is captured. AI assistant replies with a concise card highlighting vegetarian items from the actual menu and reads out the response.
- **Counts as Fail**: Voice search fails to transcribe, hallucinated items outside the shop's menu are recommended, or sound doesn't play.

### Step 26 · Customer AI ask by text
- **Action**: In the same assistant box, type: "What are your opening hours today?" and send.
- **Say / Upload**: "What are your opening hours today?"
- **Expected (Pass)**: Immediate grounded answer matching the business profile hours set in the owner app.
- **Counts as Fail**: Contradictory hours or generic "I don't know" when hours are set.

### Step 27 · Ask the owner (Authenticated thread handoff)
- **Action**: Tap **"Ask the owner"** button below an assistant answer.
- **Say / Upload**: None.
- **Expected (Pass)**: Prompt explains "Owners reply to a real person" and requests quick Google sign-in. Anonymous messages are prevented.
- **Counts as Fail**: Anonymous customer can spam the owner directly without identity.

### Step 28 · Send message to owner
- **Action**: Sign in with Google as a customer. Type message: "Can I reserve two loaves for tomorrow 10am?" and tap **Send**.
- **Say / Upload**: "Can I reserve two loaves for tomorrow 10am?"
- **Expected (Pass)**: Message appears in customer chat thread with status "Sent". View navigates to `/explore/chats/<shopId>/...`.
- **Counts as Fail**: Message send fails, input clears without sending, or chat doesn't create thread.

### Step 29 · Owner receives and replies to customer message
- **Action**: Switch back to Owner App (`business.chalkboard.shreyaan.work`). Tap **My shop** -> **Messages (1)**. Open the new conversation thread.
- **Say / Upload**: "Yes, reserved for you! See you at 10am."
- **Expected (Pass)**: Owner sees the customer's exact question and sender name. Tapping Send delivers the reply.
- **Counts as Fail**: Message badge does not show count, thread is missing, or reply fails to submit.

### Step 30 · Customer receives owner reply live
- **Action**: Switch to the customer phone screen on the chat thread.
- **Say / Upload**: None.
- **Expected (Pass)**: Owner's reply arrives in the thread (polling/stream) without needing full browser restart.
- **Counts as Fail**: Message never arrives or requires clearing cache to appear.

### Step 31 · Scan / Visit QR Stamp Card
- **Action**: On customer phone, navigate to your shop URL with QR parameter: `https://chalkboard.shreyaan.work/s/<shopId>?source=qr`.
- **Say / Upload**: None.
- **Expected (Pass)**: Animated stamp moment triggers! A die-cut stamp card displays **"1 stamp"** marked for today with note "This card is stored on this phone". Gamification feedback is clear and delightful.
- **Counts as Fail**: Stamp does not increment, no visual reward animation, or crash on `?source=qr`.

### Step 32 · QR Stamp daily uniqueness & persistence
- **Action**: Refresh the page or reopen `https://chalkboard.shreyaan.work/s/<shopId>?source=qr` again on the same day.
- **Say / Upload**: None.
- **Expected (Pass)**: Stamp count remains 1 (preventing multiple scans on same day). Stamp card state persists after page reload.
- **Counts as Fail**: Stamp resets to 0 or increments to 2 on repeat scan on the same day.

---

## Part 5 · Theme & Language Wrap-up (Steps 33–35)
*Target: Customer & Owner App Settings*

### Step 33 · Dark mode toggle across views
- **Action**: Tap the theme toggle in the header to switch to **Dark mode**. Walk through Coach, Shop, and Customer views.
- **Say / Upload**: None.
- **Expected (Pass)**: High-contrast, pleasing dark chalk theme. Text remains legible, no unstyled white containers, Voice Orb colors adapt smoothly.
- **Counts as Fail**: Unreadable dark grey text on black, blinding white boxes in dark mode, or broken styling.

### Step 34 · Language switch (e.g. Hindi or Tamil)
- **Action**: Open Settings -> Change Language to **हिंदी (Hindi)** or **தமிழ் (Tamil)**.
- **Say / Upload**: None.
- **Expected (Pass)**: UI labels, headers, Voice alerts, and stamp card switch cleanly to selected language without text clipping or overflowing screen edges.
- **Counts as Fail**: English strings remain everywhere, translated text overflows viewport, or broken fonts.

### Step 35 · PWA Installation check
- **Action**: In browser menu or in-app settings, check "Install app" option.
- **Say / Upload**: None.
- **Expected (Pass)**: Web app continues operating without forcing an install. If install banner appears, dismissing it allows normal web use.
- **Counts as Fail**: Hard paywall or mandatory install gate preventing browser usage.

---

## Test Execution Summary Sheet
- **Total Steps**: 35 (Est. time: ~20 minutes)
- **Device Tested**: `[ Android Chrome / iOS Safari ]`
- **Result**: `[ PASS / FAIL ]`
- **Blocking Issues**: (List step numbers and observed failures)
