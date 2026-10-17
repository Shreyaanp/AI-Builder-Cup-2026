# Customer front door: before and after (17 Oct 2026)

Owner (16 Oct): "the customer side opening page is bad UI/UX, extremely uncomfortable and not
mobile friendly." Measured at 360x800, 390x844 and 412x915 (light and dark), Tamil, Hindi and
Japanese at 360px, and desktop 1440x1000, with Chrome emulation (not a physical phone).
Screenshots: `front-door-before/` and `front-door-after/` (`open-*`, `keyboard-*`, `asking-*`,
`answer-*`, `welcome-360`, `desktop-*`); numbers in each folder's `measurements.json`.

Data note: the "before" run had no Chalkboard shops near Indiranagar (the demo world is off
locally); the "after" run has the area's demo shops, as production does.

## Diagnosis (before)

1. **A wizard before the page.** A first visit to `/explore/` opened a two-step setup
   ("Step 1 of 2", location, then interests) before anything useful. The focused heading had a
   heavy outline (`welcome-360.png`).
2. **Empty scroll trap.** The opening page was 1,370px tall on an 800px screen with nothing below
   the fold. A screen-reader-only status line used `width: 1, height: 1` in `sx`, which MUI reads
   as 100%: an invisible full-screen box. The same bug was in three more places.
3. **Three floating round buttons** (profile, language, theme) crowded the top bar. The area name
   got truncated to "Indira…" once a conversation started. On desktop they floated at the window
   edge, far from the centered column.
4. **Nothing nearby on the opening page.** A big headline, chips and one card, then a gap. The
   area's shops only appeared after typing something.
5. **Cut-off placeholder.** "Try “coffee under ₹50” or" ended mid-sentence at every phone width
   and in every script.
6. **Tamil nav labels ran into each other** at 360px ("பாஸ்போர்ட்அரட்டைகள்சேமித்தவை").
7. **The composer covered the end of answers.** Its clearance was a fixed 176px, and the map
   legend and buttons slid under it.
8. **Answers buried the cards.** The first shop card was below the fold behind the AI paragraph
   and a map on a 360px screen (journey audit GAP-09).
9. **Map pins were 27x27 targets.**
10. **Back left the app.** After a question, Back went to the previous site instead of the
    opening page.
11. **Chips wrapped unevenly** in a ragged row and were far from the thumb (top half of the
    screen).

## What changed

- **One purpose, thumb first.** The heading ("What are you looking for nearby?") sits at the top.
  The bottom dock holds 3-4 big chips (52px, 2x2 on phones, one row on desktop) and the composer,
  right above the navigation bar and clear of the safe areas. The chips follow the area (its own
  items) and the time (in the evening, rescue deals and what's still open lead). They step aside
  when you scroll and come back at the top.
- **Nearby shops as large swipeable cards** ("Near you now") with a same-size skeleton. Deals and
  open shops come first, then the closest. "Browse everything nearby" closes the section.
- **No wizard.** First-time visitors land on the Ask page. A "Start with your neighbourhood" card
  (Use my location / City or area) shows only until a place is chosen.
- **A light top row.** The area chip, then profile, language and theme as quiet 48px icons inside
  the column. "New conversation" moved into the dock, beside the composer.
- **Keyboard.** While typing on a phone the nav steps aside and the composer sits on the
  keyboard. `interactive-widget=resizes-content` is used where supported, with a visualViewport
  offset for iOS. The keyboard closes after sending, so answers get the screen.
- **No layout shift.** The shop-count line reserves two lines. The chips sit above the composer
  without moving it. The dock is measured, so the page ends exactly above it. The scroll trap is
  fixed.
- **Answers.** The AI paragraph stays before the cards (owner decision); a long one is four lines
  with More/Less. In a conversation the big heading becomes screen-reader only.
- **Every language.** Composer text and placeholder wrap instead of being cut. Nav labels wrap
  inside their own column. The Today card title scales down.
- **Back is sane.** The first question gets its own history entry: Back (and "New conversation")
  returns to the opening page, and a further Back leaves as usual. Back from a shop still returns
  to the same place in the conversation.
- **Motion.** The composer gets a focus ring, results go skeleton → cards dealt in, and chips are
  dealt in. Everything uses the shared motion tokens; reduced motion turns it all off. Theme
  tokens and fonts are unchanged.
- Map pins have a 48px touch area.

## Before / after

| Check (phone, light + dark)              | Before                                  | After                                     |
| ---------------------------------------- | --------------------------------------- | ----------------------------------------- |
| First screen for a new visitor           | 2-step setup wizard                     | The Ask page, with an inline "where" card |
| Page height, opening (360x800, no shops) | 1,370px (empty scroll)                  | 800px (fits)                              |
| Layout shift (CLS) on open               | 0 (static page)                         | ≤ 0.003 with cards loading in             |
| Horizontal scroll (all sizes, ta/hi/ja)  | none                                    | none                                      |
| Targets under 48px                       | composer field 32px tall, map pins 27px | none                                      |
| Composer position                        | bottom, fixed 176px clearance           | bottom thumb zone, measured clearance     |
| Composer with keyboard open (55% height) | visible, nav still taking 80px          | visible, sits on the keyboard (no nav)    |
| Placeholder                              | cut off mid-sentence                    | wraps; plain words in a conversation      |
| Area name in a conversation (360px)      | "Indira…"                               | "Indiranagar"                             |
| Nearby shops on the opening page         | none                                    | large swipeable cards                     |
| Tamil nav labels at 360px                | run together                            | wrap inside their column                  |
| Back after a question                    | leaves the app                          | opening page                              |
| Desktop                                  | controls at window edge                 | one centered 720px column                 |
