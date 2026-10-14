# B35 / B36 verification — October 15, 2026

Implemented locally; awaiting user review. Neither ID is closed or committed: the final task
rule says “Do not commit.” No push, deployment, cloud changes or live provider calls were made.

## Files changed and acceptance evidence

| ID  | Files                                                                                                                                              | Verified behavior                                                                                                                                                                                                                                                                                                                                                                                                                                             | Commit |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| B35 | `src/features/frontdoors/Marketing.tsx`, `landing.css`, `strings.ts`; `tests/frontdoors.spec.ts`                                                   | Removed the humanStack pill and its ten locale entries. At 360, 390 and 412px, business links fit with 48px targets; headings/body use compact `clamp()` scales; bento is one column; discovery cards form a content-sized grid; all three story steps remain visible in normal document flow. Cards fit at 150% text size. Desktop retains two hero columns, four bento columns and the pinned story. Reduced motion disables animations and hover movement. | None   |
| B36 | `src/app/pwa.ts`; `src/features/v1/AppShell.tsx`, `strings.ts`, all nine non-English `locales/*.ts` dictionaries; `tests/settings-install.spec.ts` | Settings reuses the banner's deferred prompt, including after banner dismissal. Installed/standalone states hide the action. Safari on iOS gets Share → Add to Home Screen instructions. Unavailable/consumed prompts get an explanatory sheet. Back/Escape close the sheet and restore Settings focus. All ten locales supply the three new strings.                                                                                                         | None   |

Settings now uses a dialog popover with native controls: axe exposed invalid ARIA-menu children
in the existing combination of language selection, theme buttons and switches. Theme button
text now uses the semantic on-surface role to correct the measured contrast failure.

## Screenshots

Phone proof is 390×844; desktop proof is 1440×1000. These were inspected after capture.

- [B35 hero](B35-hero.png)
- [B35 business button](B35-business-button.png)
- [B35 sold-out, recap and chat tiles](B35-bento.png)
- [B35 desktop](B35-desktop.png)
- [B36 Settings](B36.png)
- [B36 iOS instruction sheet](B36-ios.png)

The vertical story and discovery grid were also visually inspected at 390×844 using local
review captures in ignored `artifacts/`.

## Tests run and results

The default ports were serving another checkout. An ignored local configuration ran this
worktree's Vite server on port 38210 and its offline fixture backend on port 38310, with that
local origin explicitly allowed. Tests block external browser requests. No repository server
configuration was changed.

```powershell
$env:CI='1'
npx playwright test --config artifacts/bugs.playwright.config.ts tests/frontdoors.spec.ts tests/settings-install.spec.ts --project=phone --workers=1 --retries=0
npm run check -- -- tests/frontdoors.spec.ts tests/settings-install.spec.ts --config artifacts/bugs.playwright.config.ts --project=phone --workers=1 --retries=0
npx prettier --check src tests docs
git diff --check
graphify update .
```

- Requested Playwright suite: **17 passed**, one phone worker, no retries.
- Scoped `npm run check`: **passed**, including ESLint, TypeScript/production build, official
  React hook-rule probes and the same 17 browser tests.
- Axe WCAG A/AA checks: **zero violations** on landing at all three widths, Settings and the
  iOS instruction sheet. The existing frontdoors customer light/dark axe checks also passed.
- Formatting, whitespace checks and AST-only graph update: **passed**.
- No backend implementation changed; backend Ruff/mypy/pytest were not run.

An unscoped `npm run check` attempt passed lint/build/hooks but was interrupted after failures
in two existing `customer.spec.ts` cases and `demo-flow.spec.ts`. The customer conversation
test hard-codes port 3200 for its second browser, reaching the other checkout rather than this
test's backend. The demo failure was not investigated; these tests were left untouched. The
full 300-case suite is **not validated**.

## Open risks

- Phone layouts are browser emulation, not physical-phone evidence.
- Installation events and iOS Safari identity are simulated in Chromium. Actual Android
  installation and Safari's Share flow still need a device check; no offline-readiness claim
  is made.
- The unscoped full suite remains unvalidated as described above.
- Commit hashes and bug closure await reconciliation of the task's conflicting commit rules
  and user sign-off.
