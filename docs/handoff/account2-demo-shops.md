# Account 2 brief: demo shops, then the launch video

You are a second assistant session on the Chalkboard repo. The assistant (account 1) leads and merges.
Read `AGENTS.md`, `../rules.md` and `../PROJECT_MEMORY.md` first.

## Ground rules

- Work in your own git worktree and branch, never in the main checkout:
  `git worktree add ../wt-demo -b feat/demo-shops origin/main`
- Account 1 is working on `backend/app/boundary.py` (security headers). Codex is working on the
  rewards/stamp-card/back-in-stock files. Avoid both areas.
- Don't push to `main`, release or deploy, and don't write to production Firestore. Push your branch.
  Account 1 reviews, merges and releases.
- Never add AI co-author trailers to commits.
- Run only targeted tests locally. CI runs the full suite.
- The market is APAC/Singapore. Never India-first. Prices are in SGD, formatted with `en-SG`.
- Be honest: every demo shop is visibly labelled "Demo shop". Never present them as real
  businesses, and don't use real business names or real phone numbers.

## Task 1: demo shops (high value for judges)

Goal: `/explore` and the customer pages show 5 to 6 convincing, clearly labelled demo shops.

1. Add a `demo: bool = False` field to the business model (`backend/app/merchant.py` and
   `merchant_firestore.py`). Expose it in `public_projection`/`public_shop`.
2. Add a "Demo shop" chip to the public shop page (`src/features/public/PublicShop.tsx`) and to the
   discovery cards. Add the string in all 10 customer locales (`customerCopy.ts` and
   `customerLocales.ts`).
3. Add `backend/scripts/seed_demo_shops.py`, an idempotent seed with fixed IDs `demo-*`:
   - shops: a kopitiam in Katong, a bakery in Tiong Bahru, a halal nasi lemak stall in Geylang
     Serai, a bubble tea shop in Bugis, a hardware shop in Toa Payoh, and a florist in Joo Chiat;
   - for each: hours, a fictional phone (`+65 6000 00xx`), customer facts (halal, payment methods
     including PayNow, delivery), 6 to 12 products in SGD with one or two sold out, the customer
     page shared, and a lat/lng pin near the area;
   - all records owned by one demo owner UID passed in with `--owner-uid`;
   - add a `--dry-run` flag;
   - the script targets the emulator by default (`FIRESTORE_EMULATOR_HOST`) and refuses production
     unless `--project` is given explicitly.
4. Tests:
   - a backend test that seeds the emulator twice and checks it is idempotent and that the demo
     flag is in the projection;
   - one Playwright check that the chip renders.

## Task 2 (after Task 1 is pushed): 60-second launch video

- Use HyperFrames (HTML-to-video) or the BRAG plugin (https://github.com/latent-spaces/brag). FFmpeg
  is at `C:\Users\pshre\AppData\Local\AIBuilderCupTools\ffmpeg`.
- Story: a hawker owner snaps their menu, the coach fills the shop, they flip one item to sold out,
  a customer scans the QR and asks "halal?", gets an instant answer, then the owner sees the weekly
  recap. End card: chalkboard.shreyaan.work.
- Use real screens from a local dev run with the seeded demo shops.
- Show the Google step only as "prepares your details, Google verifies". Never show Chalkboard
  publishing to Google.
- Output `docs/launch/chalkboard-launch.mp4` (1080x1920 phone and 1920x1080) plus the source
  project folder. Don't commit files over 50 MB; leave those outside the repo and report the path.

When each task is done, write a short note to `docs/handoff/account2-status.md`. Include the
branch, what changed, the tests you ran and their results, and any open questions.
