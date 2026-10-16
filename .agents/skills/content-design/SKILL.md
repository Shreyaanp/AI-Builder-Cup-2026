---
name: content-design
description: Chalkboard content rules - plain words, one idea per screen, hard text caps, no TMI. Use for every string, card, alert, empty state and coach reply the user sees (owner and customer). Owner rule (16 Oct 2026): "no TMI, everything must make sense to the user".
---

# Content design (Chalkboard house rules)

Our users are busy shop owners (often on a phone, often not native English readers, often reading
in Hindi/Tamil/Thai…) and neighbours browsing. Every word must earn its place.

## MUST
- **One idea per screen, one per card.** If a card needs two headings, it is two cards or one tap away.
- **Text caps:** card title ≤ 5 words; card body ≤ 2 lines (~90 characters); button ≤ 3 words,
  starting with a verb ("Add photo", "Send", "Open my shop"); alert ≤ 1 sentence + action(s);
  empty state = 1 sentence + 1 button; coach spoken reply ≤ 2 sentences + 1 question.
- **Plain words a 12-year-old understands.** Say "sold out", not "unavailable inventory"; "your
  page", not "public projection"; "customers asked", not "inbound inquiries".
- **Lead with the outcome for the user,** then the detail: "Chai is ₹20 now" not "Price update
  proposal prepared for item Chai".
- **Numbers formatted for the locale** (Intl), currency of the shop, no raw IDs, no ISO dates.
- **Errors say what happened and what to do next,** in that order, with a button that does it.
  Never blame the user, never show codes or stack traces.
- **Honest labels once per page** (demo/simulated data), never repeated on every card.
- **Every string in all 15 locales**, written by meaning not word-for-word; the coach speaks in
  feminine first person in gendered languages.

## NEVER
- Explain how the app works inside the flow ("this card shows…"). Show it working instead.
- Narrate system actions ("I have prepared a draft proposal for your review").
- Put more than one primary button in a view, or more than 3 choices in a sheet.
- Use internal names (proposal, digest, revision, business_id, fixture, payload) in UI copy.
- Stack helper text, captions and tooltips on the same element.

## Check before you ship
Read each screen aloud in 3 seconds: can a first-time owner say what it is for and what to tap?
If not, cut text until they can.
