---
name: ux-review-checklist
description: Chalkboard UX review checklist - 3-second test, state coverage, eye-strain heatmap, phone reachability, accessibility, story completeness. Run it on every screen before opening a PR and when reviewing others' PRs; report findings as file:line with a screenshot.
---

# UX review checklist (run before every PR)

Take screenshots at phone 390x844 and desktop 1440x1000, light and dark, then check:

1. **3-second test:** what is this screen for, and what do I tap? If either is unclear, fail.
2. **One primary action** visible without scrolling on a phone; it is the most prominent element.
3. **No TMI:** apply `content-design` caps; count words on the screen; remove anything the user
   does not need right now (`progressive-disclosure`).
4. **Eye-strain heatmap:** squint at the screenshot (or blur it): there should be 1 clear focal
   point, at most 2 accent colours competing, consistent spacing on the 4/8-px grid, enough white
   space between groups, body text ≥ 14 px, contrast AA (axe clean).
5. **States:** loading (skeleton), empty, error (with retry/close), offline, success, long text,
   long names, 0/1/many items, slow network, permission denied (camera/mic/location).
6. **Personal:** does it use what we know about this user (`personalization`)? Is anything asked
   that we already know?
7. **Motion:** one meaningful moment, reduced motion works (`motion-and-delight`).
8. **Reachability and input:** targets ≥ 48 px, primary actions in the bottom third on phones,
   keyboard does not cover inputs, Back behaves (closes the top layer first).
9. **Story completeness:** where does the user come from, where do they go next, and is that
   hand-off obvious? No dead ends; every journey ends on a clear next step.
10. **Languages:** check one Indic and one CJK locale for overflow and tone.
Record the result in the PR description: pass/fail per item with screenshots.
