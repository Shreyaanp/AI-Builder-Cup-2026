# PR #472 local validation

OB-118: the demo customer shop must let a visitor exit to `/explore/`.

The PR head already includes the shared Exit demo action in
`src/features/demo/DemoApp.tsx`. Relative to cached main `623e89c6`, the PR changes
only `tests/agy/demo-shop.spec.ts`: it checks the demo shop URL, visible and enabled
Exit demo action, desktop keyboard activation, successful session deletion, cleared
session storage, and return to customer Explore. No product fix or assertion change
was justified by the local reproduction.

Validation uses local offline fixtures, blocked external browser requests, one
Playwright worker, ports 5572/6572, and no retries. The separate cached-main checkout
uses ports 5573/6573. No network, commit, push, deployment, or tag changes.

## Evidence

- `npx playwright test -c tests/ux/playwright.config.ts --workers=1`:
  **112 passed** (`ux-local.log`).
- `npx playwright test tests/agy/demo-shop.spec.ts --workers=1 --repeat-each=3
--retries=0 --output=test-results/demo-shop-three`: **6 passed** (three phone and
  three desktop runs). Log: `demo-shop-three.log`.
- `npx playwright test -c tests/ux/playwright.config.ts --workers=1 --grep
demo-grow --repeat-each=3 --output=test-results/grow-three`: **23 passed,
  1 failed** (390x844 dark overlap, second repetition). Log: `grow-three.log`.
  The reported 412x915 dark case passed all three repetitions.
- The same Grow batch on cached main `623e89c6`: **23 passed, 1 failed**
  (first cold 360 light case timed out before the demo banner appeared).
  No geometry findings in that batch. Log:
  `../prfix472-main-baseline/baseline-grow.log`.
- Exact 390 dark follow-up on cached main, `--repeat-each=3`: **2 passed,
  1 failed**. The first case showed "Could not load this screen" and failed the
  existing banner assertion; no overlap finding reproduced. Log:
  `../prfix472-main-baseline/baseline-grow-dark.log`.
- `npx prettier --check .`: passed (`prettier-local.log`).
- `npx tsc -b`: passed (`tsc-local.log`).
- `npm run lint`: passed (`lint-local.log`).
- `npm run rules`: passed (`rules-local.log`; existing size warnings retained).
- Backend `.venv/Scripts/ruff.exe check .`: passed. No backend changes.
- `npm run check -- -- tests/agy/demo-shop.spec.ts --workers=1 --retries=0`:
  passed lint, production build, official hook-rule enforcement, and both browser
  projects (`check-scoped.log`). The earlier unscoped check was stopped during
  build and replaced with this scoped check; the entire browser suite was not run.

## UX review

Screenshots inspected at 390x844 and 1440x1000 in light and dark themes:
`output/playwright/pr472/demo-shop-{phone,desktop}-{light,dark}.png`.

| Checklist item         | Result for this regression                                               |
| ---------------------- | ------------------------------------------------------------------------ |
| Task clarity           | Pass: the demo banner names the mode and Exit demo is visible.           |
| Action hierarchy       | Pass: Exit demo remains a secondary text button in the header.           |
| Content                | Pass: concise existing Exit demo label; no new UI copy.                  |
| Visual hierarchy       | Pass for the exit control in all four screenshots.                       |
| States                 | Happy path and completed exit pass; error and offline exit not retested. |
| Personalization        | Existing shop identity retained; no new questions or storage.            |
| Motion                 | Reduced-motion flow passes; no motion changes.                           |
| Input and reachability | Phone tap and desktop focus/Enter pass; physical phones not tested.      |
| Story completeness     | Owner demo → Browse shops → demo shop → Exit demo → Explore passes.      |
| Languages              | English checked; Indic and CJK not retested.                             |

## Remaining uncertainty

The supplied CI failure reports `demo-grow:primary` and `demo-grow:overlap` at
412x915 dark. It remains tracked as OB-180. That exact case passed all three
cached-main repetitions. No allowlist or baseline changes were made.

The second PR repetition at 390x844 dark did report overlap: Weekly recap ended
at 880px while the bottom bar started at 764px. The same case passed in the full
gate and all three initial cached-main repetitions. The Grow rendering and gate
files are identical between this PR and cached main, but the geometry failure
has not yet been reproduced on main. It remains unresolved; this document does
not claim a fix or a fully green repeated gate.

The supplied review text contained no actionable findings beyond an unclear HOLD.
Local OB-118 evidence is green, but merge readiness still has the intermittent
OB-180 risk above. Remote CI and review status were not queried or changed.

The first cold cached-main Grow 360 light case exceeded the existing 60-second
timeout (OB-170); later cases rendered normally. This is separate from the supplied
Grow geometry findings. See `../prfix472-main-baseline/baseline-grow.log`.
