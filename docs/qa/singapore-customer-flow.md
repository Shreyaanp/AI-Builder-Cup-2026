# Singapore customer language pass

Date: 2026-10-18. Scope: fixture-mode customer app, phone/touch emulation at 390 px and 360 px, Chinese (`zh-Hans`), Malay (`ms`) and Tamil (`ta`).

## Findings

- **Fixed — Malay passport streak count.** Passport showed `Pembeku: 1`; `pembeku` means a freezer. The streak protection count now reads `Perlindungan: 1`. Related freeze reward/help labels use the same protection wording. Regression: `Malay passport calls streak freezes protection, not a freezer` in `tests/i18n.spec.ts`.
- **Fixed — script fonts blocked in this linked checkout.** Vite resolved Noto and shared UI fonts under the real `node_modules` link target and returned 403, leaving script text to fallback fonts. Vite now permits the real linked dependency directory; the shop language test asserts no blocked `@fs` font responses, including Tamil at 360 px.
- **Observed — no page-wide horizontal overflow** in Ask, Browse and Passport at 390 px for Chinese and Malay. Browse had an internal Material fieldset legend with zero client width in the DOM overflow probe; it did not create page overflow or visible clipping.
- **Observed — no English functional labels or mixed-language sentences** in the sampled Chinese and Malay Ask, Browse and Passport text. Proper names, shop names and product names remained as supplied.

## Coverage and remaining validation

The first local Playwright run traversed Ask, Browse and Passport in all three locales at 390 px and 360 px and saved screenshots under `output/playwright/`. It did not complete the required results, shop, shop chat, stamp card, dark-theme, currency-content, or Tamil visual review. A later run could not reconnect after Vite restarted. The focused browser command also timed out waiting for Vite to start; its backend server started successfully. These areas remain unvalidated rather than counted as passes.

Follow-up steps: select Singapore, set each language, ask a question that returns a priced result and verify every price is `S$`; open a result/shop, send a shop question, inspect the shop stamp card and passport; repeat at 390 px and 360 px in light and dark themes, checking Tamil line wraps, clipping, overlap, feedback and browser console output. Run against a clean local Vite start on 4321 and backend on 4421.

Browser emulation does not establish physical-phone rendering or assistive-technology behavior.
