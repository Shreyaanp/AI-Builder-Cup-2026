# Account 2, next: customer sign-in, WhatsApp-style chats, and following shops

Read first:

- `AGENTS.md`;
- `STORIES.md`: the user's Oct 15 decisions for the customer side;
- `docs/stories/AUDIT.md`: gap A5.

## Setup and ground rules

- Branch: `git fetch origin; git switch -c feat/customer-chat origin/main`.
- Push only that branch. Never push to `main`: account 1 merges and ships.
- Never add AI co-author trailers to commits.
- **Use your own test ports:** `$env:WEB_PORT='3447'; $env:API_PORT='3547'`. Others use
  3200/3210/3427/3437.
- Codex is fixing audit gaps A3, A4, A6, A8, A9, A11 and A12 (customer page polling, halal answers,
  photos, freshness chip, Google chips, motion). Stay out of those.
- The user's priority is **UI/UX, animation and motion graphics**. It should feel like a premium
  consumer app, phone-first (390×844). Load `.agents/skills/material-design-3-ui`.

## Build these (the customer story, end to end)

The AI-first home is already live: `src/features/discover/AskHome.tsx` and the
`POST /api/v1/discover/ask` endpoint (`backend/app/discover_ask.py`).

1. **Sign-in to chat (A5).**
   - Browsing and instant answers need no account.
   - Messaging an owner requires Google sign-in (Firebase, like the owner app; local auth mode in
     tests).
   - Threads are owned by the signed-in customer and verified on the server.
   - Keep existing anonymous threads readable on the device that has them, but new ones need
     sign-in.
2. **Chats tab: a WhatsApp-like experience.**
   - Bottom navigation for customers: **Ask · Chats · Saved**.
   - Chats lists threads with shop photo or art, last message, time and unread badge.
   - A thread shows bubbles, the shop header, labelled AI instant answers versus the owner,
     a typing or "waiting for owner" state, send animation, and an unread count.
   - Owner replies arrive live (reuse the thread signal mechanism).
   - Demo shops reply automatically with a clearly labelled demo reply, so the demo works without a
     human owner.
3. **Follow shops, with an updates feed.**
   - A Follow button on shop pages and cards (signed in; local fallback if signed out).
   - **Saved** shows followed shops plus an **updates feed** generated from real shop events:
     price change, back in stock, new item, menu confirmed today.
   - Seed demo updates for the demo shops (labelled).
   - Give the feed cards motion: stagger, shared-element transition into the shop.
4. **Personalisation.** For signed-in customers, store preferences the customer states in Ask
   ("I'm vegetarian", "budget under ₹100", language) plus follows and recent searches. Pass them to
   `/discover/ask`, which boosts matching shops and adds a "For you" group. Show and allow clearing
   them on a small profile sheet.
5. **Neighbour tips.** Short tips or ratings on a shop page from signed-in customers:
   - moderated by a basic filter plus Gemini safety when live;
   - demo tips seeded and labelled;
   - the owner sees them in Messages.

## Done means

On a phone, the customer:

1. asks the AI;
2. opens a shop;
3. follows it;
4. signs in to chat;
5. gets a labelled demo reply;
6. sees the thread in Chats and the shop's updates in Saved.

Everything animates smoothly, respects reduced motion, and passes axe. Write
`docs/handoff/account2-status.md` with screenshots (`docs/stories/C-*.png`) and a demo script.
Commit often. If you run low on budget, push and write the resume steps.
