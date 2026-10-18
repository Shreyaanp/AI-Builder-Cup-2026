# Landing v2: phone first, plain words, motion

The classic landing (`Marketing.tsx`, `landing.css`) is unchanged and is still what `/` shows.
The new landing is a separate component, `LandingV2.tsx` with `landing-v2.css`. It keeps the
classic page's look: big bold type and big coloured tiles in the app's own colours, light and
dark.

- **Preview:** `/landing-preview` on either host. It has a slim "New landing · preview" banner
  and is never indexed.
- **Switch:** set `LANDING_VARIANT=new` on the Cloud Run service and `/` shows the new landing.
  The default is `classic`. The server marks the page (`backend/app/frontend.py`), so flipping
  it needs no rebuild. `?landing=new` or `?landing=classic` previews either one.

## Page order (390 px)

1. **What it is:** "Your shop's AI helper. Just talk to it." Who it's for: "For any shop, from a
   tea stall to a supermarket chain." Then two buttons side by side: **Try the demo** and
   **Find shops**. The first tile starts on the first screen.
2. **What it does,** as three big tiles, each with one small motion:
   - Set up your shop by talking (a voice wave).
   - Customers find you and come back (eight stamps fill in; the eighth is a free chai).
   - Stock keeps coming. The AI orders the right way for your size: a tea stall uses WhatsApp,
     a minimart sends email + CSV, a chain uses SAP (the rows slide in).
3. **Follow one cup of chai:** six stops (stall, customer, counter, wholesaler, distributor,
   chain). A cup travels down the rail as you scroll and lights each stop. Each stop has its
   Google chip.
4. **Watch it on a phone:** pick For shops or For customers. One phone plays the video, muted,
   and **Tap for sound** plays the voiceover from the start.
5. **Made for busy shops:** four big tags, two by two: Free to start, Your language, Your data
   stays yours, Talk to a human.
6. **The founder's note,** in the app's chalk handwriting.
7. **Open your shop today:** For business and Try the demo, then links to How it works and
   Features.

A thumb bar with the two actions slides up from the bottom once the hero's buttons scroll away.
It steps aside at the closing block.

Removed: the numbers and their source links, "measured and tested", and anything else that
points at the code.

Motion is CSS only: transform and opacity, 150–400 ms, ease-out. With reduced motion everything
shows at rest, and the cup sits at the end of the journey.

## The videos (with voiceover)

| Video    | Length (en / hi) | Scenes                                                        |
| -------- | ---------------- | ------------------------------------------------------------- |
| Shop     | 48 s / 48 s      | talk, live, today, reorder, order channels, till photo        |
| Customer | 38 s / 37 s      | ask for chai, the menu and prices, scan for a stamp, passport |

The customer video was re-recorded with four slower scenes so a stranger can follow it: what she
wants, what she does, what she gets.

The voiceover comes from Google Cloud Text-to-Speech (Chirp 3 HD "Aoede", en-IN and hi-IN). The
four tracks are about 1,800 characters in total, well inside the free monthly tier. The lines live
in `howItWorksCopy.ts` (`vendorVoice`, `customerVoice`), next to the captions.

Each scene lasts as long as its line needs. The footage slows down if it has to (never below
0.6×) and then holds its last frame, so no words are ever cut.

To rebuild (foreground):

1. `npx playwright test -c scripts/howitworks-videos/record.config.ts --workers=1` (optional:
   re-records the footage)
2. `node scripts/howitworks-videos/voice.mjs` (synthesises the lines; cached by text)
3. `node scripts/howitworks-videos/compose.mjs [vendor|customer] [en|hi]`

## 390 px mock

![New landing at 390 px](landing-preview-390.png)

## To approve

- [ ] The headline, "Your shop's AI helper. Just talk to it.", and the three tiles.
- [ ] The founder's note. It's a placeholder in your voice, so edit it before going live.
- [ ] The voiceovers (English and Hindi).
- [ ] Then flip `LANDING_VARIANT=new`.
