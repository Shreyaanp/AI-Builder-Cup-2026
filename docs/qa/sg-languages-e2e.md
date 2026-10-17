# Singapore languages end to end: English (en-SG), Mandarin, Malay, Tamil

Brief: `docs/briefs/task-SG-LANGUAGES-E2E.md`, folded into `task-REGION-PERSONA.md` (#75, #77).
Builds on the Hindi work (#61): every one-shot prompt pins its language through
`written_language()`, now also for Mandarin (Simplified Chinese, not Cantonese or Traditional),
Malay (Bahasa Melayu, not Indonesian) and Tamil (Tamil script).

- **Walk:** a Singapore shop (pin in Tiong Bahru, no currency sent, so the pin makes it SGD) with
  the owner app set in turn to `en`, `zh-Hans`, `ms` and `ta`, and a customer whose phone is
  `en-SG`, `zh-SG`, `ms-SG` or `ta-SG`, at 360 × 780. Offline fixtures, except the live Malay
  voice check below.
- **Checks on every screen:** `<html lang>` is the language; no text, `aria-label`, placeholder,
  title or alt left in another language (for Mandarin and Tamil: no Latin words; for Malay, which
  is Latin script too: no common English UI words); S$ and never ₹ / INR / UPI; no sideways scroll.
  Brands (Chalkboard, Google, PayNow, NETS, GrabPay, GrabFood, Grab, Gojek, Lalamove, foodpanda,
  QR, AI, GST, UEN) and the owner's own words (shop name, items, category, reward line, demo map
  places) are allowed.
- **Spec:** `tests/sg-languages.spec.ts` (8 tests: owner and customer per language), all passing.
  Screenshots: `docs/qa/sg-languages/<language>-<step>.png`.

## Flows walked

Owner: Today, coach text turn, Shop (menu prices), Grow, Payments & rides (PayNow number, save,
S$4.50 QR), You, the public customer page. Customer: Ask home (placeholder), Ask results, shop
page, chat with the shop, passport. Close the day, rescue, purchase order, playbook, face check
and privacy share their copy tables with the Hindi walk (`docs/qa/hindi-e2e.md`); every key exists
in all four languages.

## Findings

| #   | Flow                      | Finding                                                                                      | Status                                                                                                     |
| --- | ------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Coach text turn (offline) | Scripted reply "Offline demo: I received your note…" in English for zh / ms / ta             | **Fixed:** Mandarin, Malay and Tamil scripted replies (`agent.py` offline fallback, not onboarding)        |
| 2   | Ask results (offline)     | Sample area answer and place names ("Sample filter coffee house") in English                 | **Fixed:** `maps_grounding.DEMO_LANGUAGES` for hi, zh, ms, ta; Tamil and Malay coffee/parking keywords     |
| 3   | Ask placeholder           | Malay said "kopi bawah RM5" (ringgit) in Singapore; Tamil said ₹50; Mandarin "3 元"          | **Fixed:** price from the region: "kopi bawah S$3", "S$3以下的咖啡"                                        |
| 4   | Prices                    | SGD printed as "$1.80"                                                                       | **Fixed:** "S$1.80"; Tamil prints "S$ 1.80" (CLDR ta-SG spacing), which is correct                         |
| 5   | Payments & rides          | UPI-only screen; "UPI uses INR" for a Singapore shop                                         | **Fixed:** PayNow mobile/UEN with validation, PayNow QR, Save QR; copy in all locales (`regionCopy.ts`)    |
| 6   | Language step             | Singapore phones had no way to pick Mandarin, Malay or Tamil at sign-in                      | **Fixed:** English preselected, 简体中文 / Bahasa Melayu / தமிழ் offered, the step's words follow the pick |
| 7   | Shop page delivery        | "GrabFood 外送"                                                                              | OK: brand                                                                                                  |
| 8   | Malay voice (#77)         | Malay is not in Gemini Live's speech language list, so voice relies on the instruction alone | **Checked live, OK** (below). No change to `voice.py` needed                                               |

## Live Malay voice check (#77)

`backend/scripts/malay_live_smoke.py` (paid, not CI) runs the app's own Live runner and run
config (`live_run_config` with Malay) against Gemini Live (`gemini-3.8-live`, us-central1,
project `ichiropractic`), two fresh voice sessions:

| Turn                                  | Heard / sent                                                                                                   | Reply                                                                                                                   | Result                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Spoken clip (Cloud TTS ms-MY, 16 kHz) | "Selamat pagi, saya ada kedai kopi di Tiong Bahru. Secawan kopi harganya $1.80. Apa patut saya buat hari ini?" | "Selamat pagi! Saya sedia membantu anda menguruskan kedai kopi anda. Bolehkah anda beritahu saya nama kedai kopi anda?" | PASS: Malay, no English or Indonesian |
| Typed                                 | "Kedai saya jual kopi dan roti bakar kaya. Bagaimana nak tarik lebih ramai pelanggan waktu petang?"            | "Untuk membantu anda menarik lebih ramai pelanggan, boleh saya tahu nama kedai kopi dan roti bakar anda?"               | PASS                                  |

Speech recognition understood Malay without a speech language code, and the instruction kept
the replies in standard Malay ("boleh", "anda", not Indonesian "bisa", "kamu"). If Malay drift is
seen on real phones, the proposed fix (for the voice owner, `voice.py`) is to send `ms-MY` as the
input transcription hint once Live lists it, and meanwhile to repeat "Reply in Bahasa Melayu
(Malaysia/Singapore), not Indonesian" at the end of the system instruction.

## Not validated

A physical phone; the ms/zh/ta system TTS voices on a real device; live Gemini for Mandarin and
Tamil (prompt pinning is covered by `test_singapore_languages_are_pinned_in_every_prompt`).
