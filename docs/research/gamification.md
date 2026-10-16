# Customer gamification: the mechanics and the theory behind them

Track Q. The customer passport is a small game layer on top of real, verified shop visits. Every
mechanic below is grounded in a game-theory or behavioural-design result, and every one follows the
same house rules:

- **Rewards follow a verified stamp, never money.** No pay-to-play, no purchasable odds, no loot.
- **The server decides every outcome** and the odds are published next to the card.
- **Nothing expires to punish you.** Streaks bend (freezes) instead of breaking.
- **Demo shops earn demo points only**, and every generated number is labelled demo.
- **One glance explains it.** Each mechanic has a three-step "How it works" sheet and always names
  the next reward ("2 more stamps → free bun maska").

Code: `backend/app/games.py` (pure rules), `backend/app/games_routes.py` (routes),
`backend/app/passport.py` (state, streak, freezes), `src/features/passport/games/*` (UI).
Tests: `backend/tests/test_games.py`, `tests/stories/s13-games.spec.ts`.

## 1. Variable reward: the scratch card

**Theory.** Variable-ratio reinforcement (Skinner; Schultz's dopamine prediction-error work) makes
an uncertain reward more motivating than a fixed one. Its dark side is gambling-like compulsion,
so the design keeps the uncertainty and removes the exploit: the trigger is a real visit, the
price is zero, and the odds are public.

**How it works.** A verified stamp issues one scratch ticket. The prize is drawn on the server at
issue time with `secrets.randbelow` and stored; scratching (canvas, finger or mouse, haptic tick
where `navigator.vibrate` exists) only reveals it. Revealing twice returns the same result, so a
reload cannot re-roll.

| Prize                   | With a shop perk | Without |
| ----------------------- | ---------------- | ------- |
| +10 points              | 45%              | 55%     |
| +25 points              | 20%              | 20%     |
| The shop's scratch perk | 10%              | —       |
| A streak freeze         | 5%               | 5%      |
| "Try again tomorrow"    | 20%              | 20%     |

The very first card always wins +25 (stated under the odds), so the first experience teaches the
mechanic without a loss. Odds always total 100, and the customer only ever sees the table that
applies to that shop.

## 2. Endowed progress: welcome stamps

**Theory.** Nunes & Drèze (2006): a car-wash card printed as 2/10 completed beat an 8-stamp card
(34% vs 19% completion) even though both needed eight purchases. Progress you already hold feels
like something to lose and makes the goal look close (goal-gradient effect, Kivetz et al. 2006).

**How it works.** Every new shop card is printed with `WELCOME_STAMPS = 2` on top of the owner's
target: a 10-visit card shows 12 slots with 2 filled. The owner's economics are unchanged, the
customer starts two stamps in, and the welcome stamps are drawn distinctly so nothing is hidden.

## 3. Loss aversion, done kindly: streaks with freezes

**Theory.** Kahneman & Tversky: losses loom about twice as large as gains, which is why streaks
work and why broken streaks make people quit (the "what-the-hell effect"). A freeze keeps the
motivating loss frame while removing the cliff.

**How it works.** A streak counts active weeks. Every passport starts with one freeze, earns one
more every 4 active weeks or wins one on a scratch card, and banks at most 2. A missed week uses a
freeze on its own (shown as rain on the flame's 8-week strip), or the customer freezes a week
ahead ("away next week"). From Friday, if the week has no visit and a streak is running, one gentle
line appears ("Keep your streak: any stamp this week counts"). No guilt copy, no countdowns, no
notifications.

## 4. Collection sets

**Theory.** The Zeigarnik effect and completion bias: an incomplete visible set nags pleasantly,
and named collections turn scattered visits into a story (the trading-card / stamp-rally pattern,
common in Japanese eki stamp rallies). Sets also spread visits across more shops, which is what a
neighbourhood marketplace wants.

**How it works.** Three sets: **Chai trail** (4 tea or coffee shops), **Locally made** (3 shops
that make their own), **Night market** (3 food stalls after 6 pm). Distinct shops only. Finishing
a set gives a badge, +50 points, and the finishing shop's set perk if the owner set one. Each set
shows "stops nearby" that would count.

## 5. Cooperative goal: the neighbourhood bar (a public-goods game)

**Theory.** In a public-goods game, contributions collapse when free-riding pays. Two things keep
cooperation alive: visible shared progress and rewarding contributors only (Fehr & Gächter 2000;
Ostrom on commons). A shared goal also avoids the zero-sum envy of leaderboards.

**How it works.** Each area has a weekly goal (100 real verified visits; the demo area uses 500 and
generated, labelled neighbours that stop short of the goal so only real visits finish it). The bar
shows the shared total and "your visits: n". When the goal is reached, everyone who helped claims
+25 once. Contributors are stored as hashed member IDs, the document is bounded, and erasing an
account removes the person's contribution.

## 6. Social proof, opt-in and aggregate

**Theory.** Cialdini: people follow what similar others do, especially under uncertainty (a new
shop). It must be true and must never expose an individual.

**How it works.** A shop page can show "12 neighbours tried this" (distinct passports in the last
30 days), only from 3 people up. Demo shops show a generated count marked demo. Boards stay opt-in
as before.

## 7. Reciprocity: shop thank-yous

**Theory.** Reciprocity (Gouldner; Cialdini): a small unexpected gift earns disproportionate
goodwill and return visits. Small, specific thank-yous work better than discounts.

**How it works.** Owners set short perks in a calm settings tile (`OwnerPerks`): a third visit, a
tip, a follow, the scratch-card prize and the set finisher, alongside the existing full-card,
regular, quest and rescue triggers. Customers see them on the shop page before visiting (clarity)
and collect won perks in the passport, where counter staff mark them used.

## 8. Clarity

**Theory.** Hick's law and goal-gradient: a mechanic people do not understand does not motivate.
Naming the reward makes the goal concrete (implementation intentions, Gollwitzer).

**How it works.** `HowItWorks` gives each game three illustrated steps. Progress is always on
screen, and `next_reward` is computed on the server: the closest named reward across cards, sets
and the co-op goal.

## 9. Anti-abuse

One stamp per shop per day (existing), signed rotating QR, per-user rate limits on every game
route (`enforce_limits`), prizes drawn and applied on the server, demo points kept apart from real
points, and bounded shared documents. Freezes cannot be stacked past 2 or spent on a week that
already has a visit.

## What we deliberately left out

Paid boosts, countdown timers, "you'll lose everything" copy, competitive leaderboards on by default,
near-miss animations that fake an almost-win, and push nudges. They lift short-term numbers and
erode trust, which a neighbourhood shop app cannot afford.
