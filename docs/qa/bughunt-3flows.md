# Bug Hunt: The 3 Frozen Flows (17 Oct 2026)

Walk of the 3 frozen flows on branch `fix/bughunt-3flows` (from `origin/main` at `6ebf1a49`).  
Configuration: `WEB_PORT=3811`, `API_PORT=3911`, `RECALL_PATH=data/test-vectors`, foreground execution with `--workers=1`.

## Scope & Test Matrix

- **Matrix**: 360×800, 390×844, and 412×915 px; light and dark modes.
- **Languages**:
  - Vendor onboarding: English (`en`) and Hindi (`hi`).
  - Customer flows: English (`en`) and Chinese Singapore (`zh-Hans`).
- **Screenshots**: 144 reference captures under `docs/qa/bughunt-3flows/`.

### Flows Walked

1. **Flow 1: Vendor onboarding**
   - Create shop by voice UI & text chat (`/new-shop?step=chat`), coach interaction, review shop (`/new-shop?step=review`), ready preview (`/new-shop?step=ready`), and go-live.
2. **Flow 2: Customer first open**
   - Customer front door (`AskHome`), query ask & results (`/explore?q=...`), and public shop page (`/explore/s/:id`).
3. **Flow 3: QR scan → stamp**
   - Public shop stamp card (`2 of 10 stamps`), QR scan redemption (`/qr/claim`), post-scan stamp card (`3 of 10 stamps`), and customer passport (`/passport`).

---

## Findings Summary

Severity scale: 1 = blocks a core flow, 2 = data/logic error, 3 = visible UI defect or mixed language, 4 = cosmetic/minor copy.

|                               Issue #                               | Flow                                      | Severity | Summary                                                                                                                           | Key Screenshot                                                                                            |
| :-----------------------------------------------------------------: | :---------------------------------------- | :------: | :-------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| [#100](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/100) | Flow 1: Vendor onboarding                 |    3     | Coach initial greeting speech bubble is hardcoded in English when UI is in Hindi                                                  | `docs/qa/bughunt-3flows/f1-voice-360-light-hi.png`                                                        |
| [#101](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/101) | Flow 2 & Flow 3: Customer shop & passport |    3     | Floating header action buttons (`LanguagePicker`, `AppearanceToggle`, `Profile`) overlap page titles on 360px and 390px viewports | `docs/qa/bughunt-3flows/f2-shoppage-360-light-en.png`, `docs/qa/bughunt-3flows/f3-passport-360-light.png` |

---

## Flow 1: Vendor Onboarding

- **Hero / Setup**: `/new-shop` displays clear CTAs in both English ("Start with voice") and Hindi ("आवाज़ से शुरू करें").
- **Voice UI**: Displays pulsing microphone, spoken waveform indicator, and action toggles.
  - _Bug identified_: When in Hindi mode, the speech bubble greeting from the coach displays:
    `"Offline template: Hi, I am your shop coach. Let us open your shop together; I will build it as we talk. What is your business called?"`
    instead of Hindi copy ([Issue #100](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/100)).
- **Typing Fallback**: Switching to typing displays message input, suggestions, and instant draft updates.
- **Review My Shop**: Shows category, products, and location breakdown cleanly across all 3 viewports without horizontal overflow.
- **Ready & Go Live**: "Everything looks good" confirmation transitions smoothly to live shop workspace.

## Flow 2: Customer First Open

- **Front Door**: Customer front door (`AskHome`) presents localized search bar, quick chips, and neighborhood context.
- **Search Results**: Multi-column and single-column cards fit 360px, 390px, and 412px viewports cleanly. Currency displays accurately according to region ($ for Singapore, ₹ for India).
- **Public Shop Page**: Displays business banner, address, hours, menu/prices, and stamp loyalty peek button.
  - _Bug identified_: Fixed top buttons (`LanguagePicker` and `AppearanceToggle`) float directly over the shop title text on 360px and 390px viewports, rendering the shop title unreadable ([Issue #101](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/101)).

## Flow 3: QR Scan → Stamp Consistency

- **Welcome Stamps**:
  - Before scan: Shop peek button displays `Stamp card · 2 of 10 stamps`, and the stamp card displays `2 stamps` with 2 filled welcome stars.
  - The counts **agree exactly** between the peek button and the expanded stamp card.
- **QR Scan Claim**:
  - Scanning `/qr/claim` increments the count by 1.
  - Stamp dialog confirms `Shop card stamped`.
  - After scan: Shop peek button displays `Stamp card · 3 of 10 stamps`, and the stamp card displays `3 stamps` (2 welcome stars + 1 checkmark).
- **Customer Passport**:
  - Displays `3 of 10 stamps` towards reward ("7 more stamps → A free kaya bun").
  - _Bug identified_: The header `Your passport · On this phone` is partially obscured by the fixed top right buttons on 360px viewport ([Issue #101](https://github.com/Shreyaanp/AI-Builder-Cup-2026/issues/101)).

---

## Screenshot Inventory (144 files)

- **Flow 1 (`f1-*.png`, 84 files)**:
  - `f1-hero-{360,390,412}-{light,dark}-{en,hi}.png` (12 files)
  - `f1-voice-{360,390,412}-{light,dark}-{en,hi}.png` (12 files)
  - `f1-typing-{360,390,412}-{light,dark}-{en,hi}.png` (12 files)
  - `f1-answered-{360,390,412}-{light,dark}-{en,hi}.png` (12 files)
  - `f1-review-{360,390,412}-{light,dark}-{en,hi}.png` (12 files)
  - `f1-ready-{360,390,412}-{light,dark}-{en,hi}.png` (12 files)
  - `f1-golive-{360,390,412}-{light,dark}-{en,hi}.png` (12 files)
- **Flow 2 (`f2-*.png`, 36 files)**:
  - `f2-frontdoor-{360,390,412}-{light,dark}-{en,zh-Hans}.png` (12 files)
  - `f2-results-{360,390,412}-{light,dark}-{en,zh-Hans}.png` (12 files)
  - `f2-shoppage-{360,390,412}-{light,dark}-{en,zh-Hans}.png` (12 files)
- **Flow 3 (`f3-*.png`, 24 files)**:
  - `f3-before-scan-{360,390,412}-{light,dark}.png` (6 files)
  - `f3-stamp-dialog-{360,390,412}-{light,dark}.png` (6 files)
  - `f3-after-scan-{360,390,412}-{light,dark}.png` (6 files)
  - `f3-passport-{360,390,412}-{light,dark}.png` (6 files)
