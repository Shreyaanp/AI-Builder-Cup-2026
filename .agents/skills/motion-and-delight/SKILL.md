---
name: motion-and-delight
description: Chalkboard motion rules - one meaningful animation per moment, shared motion tokens (src/design/chalkMotion.ts, theme motion), celebrations for real milestones, reduced motion always respected. Use for any animation, transition or celebratory moment.
---

# Motion and delight

## MUST
- **Use the shared system:** `src/design/chalkMotion.ts` (`useChalkTimeline`, `dealIn`,
  `chalkWrite`, `stampThud`, `popIn`) and the theme's easing/duration tokens. No one-off curves.
- **Motion explains, it does not decorate:** something appears where it came from, a value is
  written in chalk as it changes, progress fills toward the next reward, a card deals onto the
  table when it is new information.
- **One reward animation at a time;** never block input; animate transform/opacity/clip-path/stroke only.
- **Durations:** micro 120-200 ms, entrances 250-450 ms, celebrations ≤ 1.2 s and skippable by tap.
- **Reduced motion:** every GSAP timeline goes through `useChalkTimeline` (no motion when the user
  prefers reduced motion); CSS animations must have a static end state.
- **Owner app is calm:** subtle entrances, chalk-written values, a gentle stamp for "done".
  **Customer app is delightful:** scratch reveals, stamp thuds, set completion, co-op bar fills,
  streak flame, but still one at a time.
- **Haptics** (navigator.vibrate) only for real moments (stamp, reward), short, never repeated.

## NEVER
- Infinite decorative loops (except a live voice orb reacting to real audio).
- Motion that delays a primary action or hides content the user needs to read.
- Celebrating non-events (opening a screen, routine saves).
