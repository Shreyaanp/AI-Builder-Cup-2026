---
name: progressive-disclosure
description: Chalkboard simplification rules - show only what matters now, details on demand, one primary action per view, guided journeys instead of long forms. Use when designing or reviewing any screen or flow, owner or customer.
---

# Progressive disclosure (simple flows, easy access)

## The rule
Each view answers one question for the user. Show the 1 thing they need now; everything else is
one tap away, never zero taps away and never three.

## MUST
- **One primary action per view** (filled button). Secondary actions are text buttons or behind
  "More". Destructive actions are never primary.
- **Today first:** home screens lead with "what needs you now" (max 3 items, most urgent first),
  then one suggested next step. History, settings and advanced options live deeper.
- **Guided journeys over forms:** anything with more than 3 inputs becomes a step-by-step journey
  (one question per screen, big targets, smart defaults, progress, Back/Next, can leave and resume).
- **Details on demand:** expandable rows, "See all", bottom sheets for quick looks, full pages for
  real tasks. Default collapsed state must still make sense alone.
- **Defaults do the work:** pre-fill from what the app knows (location, currency, business type,
  last answer) so the user confirms instead of types.
- **Every state designed:** loading (skeleton matching the content), empty (1 sentence + 1 button),
  error (what happened + retry), offline (what still works), success (brief, then move on).
- **Reachability on phones:** primary actions in the bottom third; tap targets ≥ 48 px; nothing
  essential behind hover.

## NEVER
- Dashboards of equal-weight tiles where nothing is more important than anything else.
- Modals for flows (use full-screen journeys or inline cards); confirmation dialogs where Undo works.
- Showing a feature the user cannot use yet; show the one step that unlocks it instead.
- More than 2 levels of navigation inside a tab.

## Owner vs customer
Owner app: calm, cut to the chase, fewest taps to get work done. Customer app: delightful and
flashy, but the same discipline: one hero action per screen, rich detail on demand.
