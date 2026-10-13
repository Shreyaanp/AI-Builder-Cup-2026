# Material Design 3 UI Skill review

Checked October 13, 2026 against the actual starter. Verdict: useful and suitable as our design checklist; it is not an automatic design validator or a substitute for official specifications and user testing.

Streaming follow-up: the product now reads oGoogle AI. Material guidance also informed the persistent reply/error/stop states. The current 20 browser scenarios passed; Python streaming evidence is in [TEMPLATE_REVIEW.md](TEMPLATE_REVIEW.md). Earlier scores below describe the original frontend review. Voice capture/playback and the broader redesign still await review.

## Executed evidence

| Check                         | Observed result                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream structural validator | Passed: 13 references, 14 packaged rulebook files, 6 supplied behavioral scenario documents. Those documents were not counted as executed tests.                          |
| Vendored files                | Hashes match the globally installed, pinned source files.                                                                                                                 |
| React/TypeScript              | Strict build, recommended React hook lint and zero-warning ESLint passed.                                                                                                 |
| Hook rule enforcement         | Deliberately conditional hook and missing effect dependency rejected; a valid effect accepted.                                                                            |
| Browser scenarios             | 12 passed, six scenarios across Android-sized Chrome and desktop Chrome.                                                                                                  |
| Accessibility scans           | No detected violations for the tested WCAG A/AA tags in light, dark, edit dialog and Hindi/large-text states. This is not full WCAG conformance or a screen-reader audit. |
| Adaptive layout               | No horizontal overflow at 320px with 200% text, and at 360/599/600/899/900/1200px. Navigation and input retained.                                                         |
| Local-data boundary           | Business data absent from preference storage; photo previews removed without upload; no external Google/model requests observed.                                          |
| Formatting                    | Prettier check passed; external rulebook files excluded from rewriting.                                                                                                   |
| Repository                    | Local main/origin prepared; remote branch list empty. No commit or push.                                                                                                  |

The browser scenarios cover context continuity across destinations, exact session review, review invalidation on edits, Hindi/reflow, theme/dialog accessibility, keyboard Escape/focus return, photo handling, honest voice/integration status and preference-only persistence. Screenshots are in ignored `test-results/`.

## What the rule set helped us catch

- React's executable rules rejected synchronous derived photo-preview state inside an effect. URL creation moved into the file event, with explicit replacement/removal/unmount cleanup.
- The skill requires actual contrast checks after applying brand colours. Initial scans captured theme interpolation/dialog fade. Foreground theme colours now switch directly; tests wait for browser-reported animation completion before scanning settled states, without arbitrary sleep or disabling contrast checks.
- Large Hindi text needed wrapped header/control rows and reachable content rather than forced no-scroll clipping.
- Mobile card/input ordering was adjusted so the business card is above the input dock. Desktop retains useful supporting panes.

## Scoped self-audit

Score: 0 missing/incorrect, 1 partial, 2 ready for this local starter review. These are review judgments, not measured certification.

| Area                 | Score | Reason / remaining check                                                                                             |
| -------------------- | ----: | -------------------------------------------------------------------------------------------------------------------- |
| Task clarity         |     2 | One business card and one current coaching step.                                                                     |
| Hierarchy            |     2 | Greeting, card and input have clear grouping; desktop has two panes.                                                 |
| Component semantics  |     1 | Edit/review/navigation work; voice is a clearly explained future connection.                                         |
| Token discipline     |     1 | Semantic colours/type are centralized; remaining component geometry should be consolidated before expansion.         |
| Adaptive behaviour   |     1 | Tested widths and enlarged text pass; actual phone keyboard/landscape testing remains.                               |
| States and feedback  |     1 | Empty/error/revised/session-review/offline states exist; live network loading and recovery belong to later adapters. |
| Accessibility        |     1 | Automated checks, labels and focus tested; manual screen-reader/touch testing remains.                               |
| Expressive restraint |     2 | Calm surfaces and limited emphasis; reduced motion respected.                                                        |

## Limits and next review

The skill provides principles and routing, not exact pixel specifications for every control, a complete React implementation, or proven mobile-user outcomes. Exact values must be checked against official sources. First-launch greeting animation, optional installation, physical-phone keyboard behaviour, Marathi/Tamil, account linking, actual AI/audio, ADK, inventory, requests and Google publication remain separate work.

The production entry bundle is approximately 504KB / 157KB gzip. Vite warns at 500KB; route/dialog splitting and a throttled-phone performance run remain before release. This starter has not been deployed or performance-certified.

Automatic approval review rejected the optional removal of unused Vite sample assets with the reason "blocked by policy". They remain unused; no alternate deletion route was attempted.
