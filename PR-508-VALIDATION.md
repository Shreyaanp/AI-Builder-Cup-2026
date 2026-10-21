# PR #508 local merge review

Reviewed head: `a5408182` on `auto/ob-144`, 21 October 2026. No network access,
publication, cloud changes, or paid inference used. Ports: 5608/6608.

## Implementation evidence

The supplied HOLD predates the current head. The head already reduces the compact
celebration illustration from a 150 px container / 128 px sticker to 72 px, without
shrinking text or controls (`src/features/passport/StampMoment.tsx:388`). The
OB-144 regression asserts `scrollTop === 0` and full foil clearance before any
swipe or programmatic scroll (`tests/ux/ob-144-stamp-scroll.spec.ts:48`).

Temporarily restored the pre-fix production component from `HEAD^`, kept the
current test, and ran the 390 light case with one worker. It failed at line 65,
the initial foil-clearance assertion. Restored the current component byte for
byte afterwards. This demonstrates that the test detects the original clipping.
No assertions, allowlists, skips, delays, retries, or source code were changed.

## Validation

- Initial affected spec: 8/8 passed.
- Affected spec repeated three times with `--workers=1 --repeat-each=3`:
  24/24 passed, without retries.
- Full UX gate, `npx playwright test -c tests/ux/playwright.config.ts --workers=1`:
  112/112 passed.
- `npm run check -- -- --workers=1 tests/stories/s8-passport.spec.ts`: passed lint,
  production build, official hook enforcement, and all four Passport story cases
  (phone/desktop, light/dark), including their axe checks.
- `npx prettier --check .`, `npx tsc -b`, `npm run lint`, `npm run rules`, and
  `backend/.venv/Scripts/ruff.exe check backend`: passed.
- `graphify update .`: passed; no topology changes, graph outputs untouched.

## Scoped UX review for the PR description

Local screenshots: `test-results/ob-144-initial-390-light.png`,
`test-results/ob-144-initial-390-dark.png`, and
`test-results/ob-144-initial-1280-dark.png`. The Passport story also captures
1440x1000 desktop evidence in `docs/stories/customer-desktop-*-stamp-3.png`.

| Checklist                           | Result                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| Purpose and next action             | Pass: stamp confirmation, foil and Passport action visible.                         |
| Primary action / phone reachability | Pass: pinned Passport action and full foil on arrival.                              |
| Content and personalization         | Existing copy, shop identity and points preserved.                                  |
| Hierarchy and spacing               | Pass for scoped illustration change; text sizes preserved.                          |
| States                              | Successful full celebration and repeat-stamp story checked; other states unchanged. |
| Motion                              | Reduced-motion regression passes; existing animation code preserved.                |
| Accessibility and story handoff     | Passport story axe checks and onward navigation pass.                               |
| Languages / physical devices        | Not validated in this local review.                                                 |

## Limits and unrelated findings

The full 1,746-case browser suite was not run; `npm run check` was scoped as shown.
Browser emulation does not establish physical-phone or system-bar behavior.
No live AI or ASR accuracy claims. Existing warnings remain tracked as OB-164
(graph extraction), OB-165 (bundle size), and OB-171 (GSAP targets).
Windows asyncio socket teardown logged WinError 10054 while adjacent UX tests
passed; logged immediately in the owner's bug list as OB-178, outside this fix.
