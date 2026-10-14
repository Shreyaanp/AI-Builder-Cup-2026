# Account 2 status

## Task 1 — demo shops: done

**Branch:** `feat/demo-shops`, created from `origin/main` at `cd89d7a`. It lives in account 2's
existing worktree (`C:\Users\pshre\work\chalkboard-ui`), not a new `../wt-demo`: the owner asked
me to work only in my own worktree. Nothing touches `backend/app/boundary.py` or the
rewards/stamp-card/back-in-stock files.

### What changed

- **Model** (`backend/app/merchant.py`): `BusinessFields.demo: bool = False`.
  - **Shape:** it is left out of the record when false, so existing shops and sealed digests are
    unchanged.
  - **Projection:** `public_projection` adds `"demo": true` for demo shops, so `public_shop` and
    `shared_shops` return it.
- **Server-owned label:** only the seed script can set `demo`. `prepare_pin` (used by
  `POST /proposals` and `/businesses/{id}/update`) overwrites a client's value with the saved one,
  so an owner can neither add nor remove the label. The coach tool already merges saved fields. A
  test covers it.
- **Store method:** `seed_demo_shop(uid, bid, fields, products) -> bool` is on
  `MerchantRepository`, implemented in both `MerchantStore` and `FirestoreMerchantStore`.
  - **Idempotent:** it returns `False` when the stored shop already matches.
  - **Reset:** otherwise it puts the fields and menu back as seeded, keeping product IDs stable,
    and shares the page.
  - **Refuses:** a non-`demo-…` ID, a shop not labelled demo, and a shop owned by another account.
- **IDs:** the fixed IDs are `demo-<slug>` (`^demo-[a-z0-9-]{1,40}$`). Two UUID-only gates had to
  accept them:
  - **Firestore `document_id`:** a narrow allowance; the strings can't form paths, and every
    other ID is still UUID-only.
  - **The customer app's shop route** (`CustomerApp.tsx`): it only matched UUIDs, so demo pages
    were unreachable.
  - **Unchanged on purpose:** the coach API (`CoachRequest`, live websocket) stays UUID-only, so
    demo shops are display-only (public page, `/explore`, Q&A, messages).
- **Discovery** (`discover.py`): `DiscoveryPlace.demo_shop`. I didn't reuse the existing `demo`
  field, which means demo map data or fixture pins.
- **Frontend:**
  - **"Demo shop" chip:** on the customer page and on `/explore` cards.
  - **Customer page note:** one line, "Sample shop for this prototype — not a real business."
  - **No call/message links:** Call and WhatsApp are hidden for demo shops, so a fictional
    `+65 6000 00xx` number is never dialled or messaged. That range isn't guaranteed unassigned.
- **Copy:** `demoShop` + `demoShopNote` in `customerCopy.ts` and all 9 `customerLocales.ts`
  locales (10 in total, with real translations), plus `demoShop` in the discovery strings for all
  10 locales.
- **Seed script** (`backend/scripts/seed_demo_shops.py`, `--owner-uid` required, `--dry-run`):
  - **Targets:** the Firestore emulator by default (`FIRESTORE_EMULATOR_HOST`, project
    `demo-ogoogle-local`, `--namespace` defaults to `ogoogle_ai_v1`). It refuses with exit 2 when
    the emulator isn't set and no `--project` is given. `--sqlite PATH` seeds a local dev database.
  - **Shops:** all names are fictional. Each has a `(demo)` location, an approximate pin, hours,
    PayNow plus other payments, delivery, SGD prices, 6–10 items with 1–2 sold out, and a shared
    customer page.

  | ID                              | Name                             | Area          |
  | ------------------------------- | -------------------------------- | ------------- |
  | `demo-katong-kopitiam`          | Sunny Side Kopitiam              | Katong        |
  | `demo-tiong-bahru-bakery`       | Crumb & Courtyard Bakery         | Tiong Bahru   |
  | `demo-geylang-serai-nasi-lemak` | Serai Sunrise Nasi Lemak (halal) | Geylang Serai |
  | `demo-bugis-bubble-tea`         | Pearl Lane Bubble Tea            | Bugis         |
  | `demo-toa-payoh-hardware`       | Lorong Fix-It Hardware           | Toa Payoh     |
  | `demo-joo-chiat-florist`        | Petal Studio Joo Chiat           | Joo Chiat     |
  - **Halal:** set only for the four food shops. The hardware shop and the florist carry payment,
    delivery and a type-specific fact instead, matching main's rule of no food questions for
    non-food shops.

- **Contract:** regenerated (`docs/openapi.json`, `src/api/generated.d.ts`).

### Tests run

- **Backend:** `ruff check`, `ruff format --check`, `mypy app` pass.
  - **Targeted:** `pytest tests/test_demo_shops.py tests/test_merchant_store.py
tests/test_merchant_routes.py tests/test_sharing_routes.py tests/test_discover.py` → 88 passed,
    with the Firestore emulator running (`FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`), so both store
    adapters ran.
  - **New `test_demo_shops.py`:**
    - seeding twice is idempotent on SQLite and on the emulator, and the projection carries
      `demo`
    - an owner's own change is reset while product IDs stay the same
    - other owners, non-demo IDs and unlabelled shops are refused
    - the script refuses to run without the emulator or `--project`, and `--dry-run` writes
      nothing
    - an owner can't set the label through `POST /proposals`, and discovery shows no
      `demo_shop`
- **Frontend:** `tsc -b`, `eslint src --max-warnings 0`, `prettier --check src tests` pass.
- **Playwright:** run on alternate ports 3210/3310 through temporary, uncommitted configs.
  Ports 3200/3300 were held by other checkouts' dev servers, which I didn't stop.
  - **`tests/demo-shops.spec.ts`** (new, phone + desktop): it serves the real projection shape
    and checks the chip and note on the customer page, no `tel:`/`wa.me` links, and the chip on
    an `/explore` card. It passed in every run except one first-navigation timeout under load,
    which passed on retry.
  - **`discover.spec`, `frontdoors.spec`, `customer.spec`:** all pass on phone and desktop when
    run with one worker. `customer.spec` hard-codes `127.0.0.1:3200`, so it ran as a port-swapped
    temporary copy. With three workers this machine was too loaded, and `page.goto` timed out
    across specs.
- **Manual end-to-end:** I seeded a separate SQLite file (`backend/data/demo-merchant.sqlite3`,
  git-ignored) twice; the second run reported "already up to date" for all six. Served from it,
  the real pages show the chip, the note, fact chips and sold-out items. `/api/v1/discover` near
  Geylang Serai returns three `demo_shop` places.

### Open questions

1. **Shared dev database:** don't seed `backend/data/merchant.sqlite3`, the database the dev
   server and Playwright use. The demo bakery sits inside Tiong Bahru's default 3 km radius, and
   `discover.spec` expects "Bakery + Open now" to find nothing. Seed a separate file
   (`--sqlite data/demo-merchant.sqlite3`) and point `MERCHANT_DATABASE` at it for demos. That's
   also why the Playwright check serves a fixed response rather than seeding.
2. **Freshness line:** demo shop pages show "Menu not confirmed yet". I left `last_confirmed`
   unset rather than fake a confirmation. Say if the seed should stamp it on each run.
3. **Production seeding:** not done, and only possible with an explicit `--project`. It needs a
   real demo owner UID from account 1.

## Task 2 — launch video

Not started; it begins after this branch is pushed.
