# First-open explainers and owner tour

Implementation: owner and customer have separate, versioned device flags. Completing or skipping
the cards remembers the choice; merely rendering them does not. You/profile settings can replay
them without resetting that choice. Headlines and controls cover all 15 locales. The owner entry
shows its cards before loading the workspace. Existing onboarding and shared customer links remain
the destinations after dismissal.

The owner tour has 14 stops. Its six new previews reuse the selected demo shop's Today supply card,
purchase-order timeline, SAP document, photo-import panel, first-customer sharing card and actual
congratulations page. Previews are inert: the walkthrough does not import, send or publish. Voice
skip stops only the current voice; next, close and Escape stop narration and cancel pending loads.

## Executed checks

- `npm run check`: passed lint, TypeScript/build, hook enforcement and 5 focused Playwright tests.
  For this run only, the build/test scripts used `tests/tour.vite.config.ts` and
  `tests/tour.playwright.config.ts`; the original package file was restored afterward. This disables
  `.env` loading, uses a built static bundle, mocks API responses and blocks external browser hosts.
  It does **not** claim the repository's full browser/backend suite passed.
- `npm run rules`: passed.
- The unit checks cover separate device/app flags, storage failures, all locale entries and the
  six-word headline limit. Phone tests cover both apps: swipe, tap, completion, reload, replay and
  skip; widths 360/390/412; 48 px controls; no horizontal overflow; reduced motion; Hindi/Japanese
  dark screens and axe checks. English light and Hindi/Japanese dark screenshots also cover 1440 px.
- Narration tests cover late responses, cancellation, fallback, autoplay rejection, voice skip,
  next, close, saved preference and all six added feature stops using a mocked seeded order.
- Build completed with bundle-size warnings for chunks over 500 kB.

## UX review

| House checklist        | Result and evidence                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 3-second purpose       | Pass: one large icon and one short headline; phone screenshots inspected.                                                                    |
| One primary action     | Pass: Next/Start is the only filled action.                                                                                                  |
| Text caps              | Pass: six headlines per locale, at most six space-separated words each.                                                                      |
| Hierarchy and contrast | Clear icon/headline hierarchy; dark Hindi/Japanese axe checks pass. Light contrast visually reviewed.                                        |
| States                 | Persistence, replay, skip and blocked storage covered. Intro needs no API; tour uses offline fixtures. Live failure recovery is unvalidated. |
| Personal context       | App-specific copy follows the selected/device language; no personal data stored in the flag.                                                 |
| Motion                 | Card changes are instant; tests use reduced motion. Existing congratulations motion is disabled in tour previews.                            |
| Reachability/input     | Bottom primary action; 48 px checks; swipe has buttons and arrow-key alternatives. Physical phone and assistive-technology use unvalidated.  |
| Journey                | Both first-run/replay exits tested; tour feature previews and close tested. Real sign-in/onboarding completion not exercised here.           |
| Languages              | All 15 locale entries/word limits checked; Hindi and Japanese dark captures/axe checks. Native-speaker copy review remains open.             |

Screenshots (local artifacts, under `output/playwright/`):

- [Owner, light, 390](../output/playwright/first-run-owner-light-390.png)
- [Customer, light, 390](../output/playwright/first-run-customer-light-390.png)
- [Owner, Hindi dark, 390](../output/playwright/first-run-owner-hi-dark-390.png)
- [Customer, Hindi dark, 390](../output/playwright/first-run-customer-hi-dark-390.png)
- [Owner, Japanese dark, desktop](../output/playwright/first-run-owner-ja-dark-1440.png)
- [Customer, Japanese dark, desktop](../output/playwright/first-run-customer-ja-dark-1440.png)
- [Tour, seeded SAP preview](../output/playwright/tour-sap-hi-390.png)

## Open validation

Browser emulation is not a physical-phone test. Live narration/provider accuracy, real sign-in,
real backend seeding and the full regression suite were not exercised. Browsers that deny device
storage can continue, but cannot remember dismissal across visits. No landing files, credentials,
cloud resources, external businesses or deployment state were changed.
