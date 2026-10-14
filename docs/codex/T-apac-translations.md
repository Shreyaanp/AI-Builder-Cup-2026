# Task T — Native APAC translations (Singapore demo) + multilingual evals

Read `docs/codex/CONVENTIONS.md` first. Market: **Asia Pacific & Japan, demo in Singapore. Not
India.** Default UI language is English; the UI follows the phone's language setting
(`src/i18n/locales.ts`: `systemLocale`, `LOCALES`), with a manual override only in Settings.

## 1. Owner app translations (`src/features/v1/strings.ts` is the English source)
Create one file per locale in `src/features/v1/locales/`: `zh-Hans.ts`, `ms.ts`, `ta.ts`, `ja.ts`,
`ko.ts`, `id.ts`, `th.ts`, `vi.ts`, `fil.ts`, each `export const <name>: Copy = { ... }` covering
**every key** of `en` (typed as `Copy` so missing keys fail type-checking), and register them in
`locales/index.ts`. Function-valued keys keep the same parameters (e.g. `coachGreetingShop(name)`,
`readiness(done, total)`); arrays (e.g. `googleSteps`) keep the same length.

Translation quality bar — "native", not literal:
- Written as a native speaker in Singapore/Malaysia (zh-Hans, ms, ta) or the home market (ja, ko,
  id, th, vi, fil) would write a friendly, clear consumer app. Short labels for buttons (fit 48dp
  buttons on a 360px screen). Use the conventional terms of each market for shop, menu, sold out,
  price, privacy, terms. Japanese: polite です/ます; Korean: 해요체; Thai: polite particles where
  natural; Tamil: Singapore Tamil usage, avoid India-specific idioms.
- Keep brand/product names untranslated ("Chalkboard", "Google", "Google Maps", "Gemini").
- Keep placeholders, ellipsis character `…`, and punctuation conventions of each language.
- Remove India-specific examples from the English source too: `landingEyebrow` must speak to APAC
  shops (e.g. "For hawker stalls, cafés, bakeries and every corner shop"); replace any "kirana",
  "₹", Indian place names or rupee examples with neutral/Singapore ones (kopi, kaya toast, SGD).
- Update `previewChat`/`previewReply` and the Landing phone mock (`src/features/v1/Landing.tsx`,
  currently "Chai · ₹12 / cup", "Samosa") to a Singapore example (e.g. Kopi · $1.80 / cup,
  Kaya toast sold out) using `formatPrice`.

## 2. Customer page (`src/features/public/PublicShop.tsx`)
Fill `publicTranslations` for the same 9 locales (every key of `en`). The customer page follows the
**customer's** phone language.

## 3. Legal texts (`src/features/v1/legal.ts`)
Add translations of `TERMS`, `PRIVACY`, `BIOMETRIC_NOTICE` per locale (new structure:
`LEGAL[locale]` with English fallback) and show a one-line note in `LegalDialog` for non-English:
"Translation for convenience — the English version applies" (translated). Keep `LEGAL_VERSION`.

## 4. FaceDialog
Move its inline English/Hindi strings into `strings.ts` keys (then translated like the rest) and
delete the Hindi branches; the dialog uses `useCopy()`.

## 5. Coach evals in APAC languages (`backend/scripts/coach_eval.py`)
Replace India fixtures with Singapore/APAC ones and add scenarios so every target language is
covered at least once: Mandarin (new shop: 阿明咖啡店 kopitiam in Tiong Bahru), Malay (menu items:
nasi lemak, teh tarik with prices), Tamil (Singapore Tamil price correction), Japanese (sold out:
焼きそば), Korean, Bahasa Indonesia, Thai, Vietnamese, Filipino. Each scenario checks the right
tool and that the reply is in the same language/script (simple script regexes for CJK/Thai/Tamil;
for Latin-script languages a small keyword set). Keep all GLOBAL_CHECKS. Do not call the model in
CI — this script is run manually.

## 6. Tests
- Playwright `tests/i18n.spec.ts`: with `locale: 'ja-JP'` the owner app renders Japanese (consent
  title), with `ms-MY` Malay, with `en-SG` English; Settings override switches language and
  persists after reload; the customer page follows the browser locale; no horizontal overflow on
  phone in ja, ta and th; axe zero violations in ja and th (light).
- A unit test (Playwright `page.evaluate` or a small vitest-free check) for `systemLocale` mapping:
  zh-SG→zh-Hans, zh-TW→zh-Hans, in-ID→id, tl→fil, fr-FR→en.
- Keep all existing suites green (they run with `locale: 'en-SG'`).
