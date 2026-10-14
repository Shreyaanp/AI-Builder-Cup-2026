# Account 2: Source supplies in the coach chat (Forecast → Source → Sell)

You are the assistant (account 2) on the Chalkboard repo. Account 1 leads, reviews and merges.

Read first:

- `AGENTS.md`;
- `BUGS.md`;
- `PROJECT_MEMORY.md` (one level up), which records the confirmed product decisions.

## Ground rules

- Work in your worktree on a new branch: `git fetch origin; git switch -c feat/sourcing origin/main`.
- Push only that branch. Never push to `main`: every main push auto-releases to production.
- Never add AI co-author trailers to commits.
- Demo data must be visibly labelled "Demo". Never present simulated suppliers or orders as real.
- No payments or checkout. Deals are requested and agreed in chat.
- Load `.agents/skills/material-design-3-ui` before building UI. The user's top priority is
  **meaningful, polished motion** and a phone-first layout (390×844). It must feel like a premium
  product, not a form.
- **Testing:** the user wants speed. Write targeted tests for the core path while you build, run
  them once at the end, and fix what fails.
- If you run low on budget, commit and push what works, then write `docs/handoff/account2-status.md`
  covering what's done, what's next, and exact resume steps, so you or account 1 can continue.

## The story to make work end to end (this is the hackathon demo)

1. **The owner notices a shortage**, any one of three ways:
   - by text or voice: "My flour is running low" or "I need 20 kg flour by tomorrow";
   - the Prep plan tile shows "Running low: flour" with a **Find suppliers** action;
   - the coach notices it while answering a forecast question.
2. **The coach finds suppliers.** A new tool, `find_suppliers(item, quantity?, unit?)`, searches
   supplier merchants near the owner's shop pin (any country):
   - Chalkboard shops flagged as suppliers, or shops whose inventory has the item;
   - ranked by distance, price and availability.

   In the chat, show a short animated "Searching nearby suppliers…" state (radar or shimmer).
   Then **supplier cards** stagger in as a horizontal carousel inside the conversation, each with:
   - name and distance;
   - price per unit and what's in stock;
   - delivery note and minimum order;
   - a Demo chip when the supplier is demo data.

3. **The owner picks and orders by voice or text**: "The second one looks good, order 20 kg flour and
   5 kg sugar from them." A tool, `prepare_order(supplier_id, items[], note?)`, produces an **order
   request card** in the chat showing:
   - the supplier;
   - lines with quantity, unit and estimated price;
   - the estimated total in the shop currency;
   - the delivery date or time.

   The owner confirms with **one tap** (the app's rule: the owner confirms before anything is sent).
   On confirm, it animates: the card flies into a "sent" state.

4. **The supplier conversation.** The confirmed request opens a supplier thread (chat). Reuse the
   existing inquiry/thread infrastructure (`backend/app/threads.py`, inquiries, the Messages inbox)
   or extend it for merchant-to-merchant threads, with a structured "order request" message.
   - **Demo suppliers reply automatically** within a few seconds, like a real wholesaler: "Confirmed,
     20 kg flour ₹1,240, delivering tomorrow 9am" (or ask one clarifying question). The reply is
     clearly labelled as an automatic demo reply.
   - The coach announces the reply in the owner's chat. The owner can keep chatting there ("can you
     deliver by 8?").
5. **Orders view.** A compact **Orders** tile or sheet on My shop lists requests with their status:
   sent, confirmed by supplier, needs reply. Tapping one opens the thread.

## Supplier data that works anywhere

- Add a supplier role to businesses: a `supplier` flag and supplied categories. Supplier inventory is
  normal products with units like kg, litre or pack, plus `min_order` and a `delivery` note.
- **AI-generated demo suppliers anywhere.** When `find_suppliers` finds none within range of the
  shop's pin, generate 3–5 plausible **demo** suppliers near that pin with Gemini:
  - local names, the shop's currency, realistic wholesale prices;
  - the requested item plus related items.

  Store them through the existing demo-shop path: `demo` flag, owned by the demo owner, pinned within
  a few km. They then persist and are reused. Do the same, cheaply, for common categories:
  - **food:** flour, sugar, oil, rice, dairy, vegetables, coffee and tea, packaging;
  - **retail:** stationery, cleaning supplies.

  In offline or test mode, use a deterministic fixture generator.

- Codex is separately seeding demo **shops** (not suppliers) in Bengaluru, Delhi, Mumbai, Kuala
  Lumpur, Jakarta, Tokyo and Bangkok, with sales history (`backend/scripts/seed_demo_shops.py`,
  branch from Codex). Don't edit that script. Keep supplier generation in its own module.

## Robustness: real businesses say things in many ways

Handle these in the agent prompt and tools, with a few eval cases:

- several items in one message;
- unit conversions (kg and g, litre and ml);
- "the cheapest one" or "the nearest one";
- "order the same as last time";
- "change the quantity to 15";
- "cancel that order";
- "ask them if they deliver on Sunday";
- an unknown item (ask once, briefly);
- no supplier found (generate demo suppliers, and say so honestly);
- voice orders.

The voice session uses the same tools (`backend/app/voice.py`, `make_agent(live=True)`). Make sure
the Live model actually calls the tools. In account 1's test, voice answered "I can't access your
menu" instead of calling them, so check the instruction and tool declarations for live mode.

## Files you will likely touch

- `backend/app/coordinator.py`: the new tools, registered in `agent.py`;
- `backend/app/agent.py`: prompt rules for sourcing;
- `backend/app/streaming.py`: forward the new cards to the UI like proposals;
- a new `backend/app/sourcing.py`: search, demo supplier generation, orders;
- the merchant repositories (both adapters);
- routes;
- `src/features/v1/screens/CoachScreen.tsx` and the chat message rendering (supplier carousel, order
  card, motion);
- `ShopTiles.tsx` (Orders tile) and the Messages inbox;
- strings in all locales: `src/features/v1/strings.ts` and `locales/*`. Codex is adding Hindi,
  Bengali, Telugu, Marathi and Kannada now, so expect to add your keys there after merging main.

## Done means

On a phone, the owner says "my flour is running low" and the result:

- animates in;
- leads to one confirming tap;
- opens a supplier thread with a labelled demo reply;
- shows the order in the Orders tile.

The same works by voice. Write `docs/handoff/account2-status.md` with screenshots
(`docs/bugs/SRC-*.png`) and a short **demo script**: the exact phrases to say, in order.
