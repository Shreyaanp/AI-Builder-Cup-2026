# Test Gap Analysis (Manual Test Script vs Automated Tests)

This document tracks all test scenarios from [manual-test-script.md](file:///C:/Users/pshre/work/agy-fix-manual-tests/docs/qa/manual-test-script.md) that do not currently have end-to-end or unit automated test coverage, along with the designated test file where each automated test should be implemented.

---

## Gap Summary Table

| Step #           | Scenario Description                                                                       | Why It Is an Automated Gap Today                                                                                                                                                                                    | Target Test File for Automated Test                                                        |
| :--------------- | :----------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------- |
| **Step 2**       | Live Gemini Achernar voice audio streaming & female voice greeting playback over WebSocket | Automated Playwright tests (`tests/stories/s10-new-shop.spec.ts`) mock audio stream with an oscillator / offline scripted string fixture; live Gemini Live WebSocket audio decoding and playback is skipped offline | `tests/qa/voice-continuity.spec.ts` (E2E with audio fixture) & `backend/tests/test_tts.py` |
| **Step 4**       | Conversation silence timeout fallback in onboarding                                        | Offline fixtures in `s10-new-shop.spec.ts` simulate the step timeout with scripted timers, but backend LLM silence event handling on live sessions lacks automated test                                             | `tests/stories/s10-new-shop.spec.ts` & `backend/tests/test_voice_continuity.py`            |
| **Step 5**       | Live microphone barge-in / speech interruption of coach speech                             | Acoustic echo cancellation and client-side barge-in interruption is device-dependent and mocked out in browser tests                                                                                                | `tests/qa/voice-continuity.spec.ts` (simulating client interruption frame)                 |
| **Step 6 & 7**   | Microphone blocked alert (`mic-blocked`), retry button, and "Type instead" fallback        | `s10-new-shop.spec.ts` tests happy-path permissions; there is no automated Playwright test that sets permissions to `denied` and clicks `Try again` or verifies `VoiceAlert` recovery                               | `tests/stories/s10-new-shop.spec.ts` or new `tests/qa/voice-alerts.spec.ts`                |
| **Step 8 & 9**   | Offline network toggle during active VoiceStage WebSocket & reconnect resumption           | Current `voice-continuity.spec.ts` tests server-side session resumption via reload, but no UI test drops connection mid-stream (`context.setOffline(true)`) while in `VoiceStage`                                   | `tests/qa/voice-continuity.spec.ts`                                                        |
| **Step 10**      | Voice rate limit UI alert (`rate-limited` countdown timer and "Voice is busy")             | Backend `backend/tests/test_conversation_cap.py` verifies 429 status code, but frontend `VoiceAlert` displaying the rate limit countdown has no automated Playwright spec                                           | `tests/stories/s10-new-shop.spec.ts`                                                       |
| **Step 13 & 14** | Mute coach voice toggle cutting off audio playback immediately and resuming                | Mute button exists in UI, but no automated test checks `audio.suspend()` / `gainNode.gain.value === 0` state on mute toggle                                                                                         | `tests/stories/s10-new-shop.spec.ts`                                                       |
| **Step 15**      | Pause and resume microphone state                                                          | Tested visually in story step, but no assertion validates that WebSocket incoming audio chunk stream ceases while paused                                                                                            | `tests/qa/voice-continuity.spec.ts`                                                        |
| **Step 16**      | Coach forecast & insights chart cards interactive render                                   | Chart cards are tested visually and in unit specs (`backend/tests/test_charts.py`), but phone interaction with chart tabs / screen-reader accessibility tables in chat lacks E2E spec                               | `tests/qa/voice-continuity.spec.ts` & `tests/forecast.spec.ts`                             |
| **Step 17**      | Voice continuity across reload & exact rollover announcement                               | Server-side continuity and rollover are tested in unit tests (`test_voice_continuity.py`), but live browser microphone reconnection across physical tab reloads needs dedicated E2E                                 | `tests/qa/voice-continuity.spec.ts`                                                        |
| **Step 20**      | Shopfront photo upload with SafeSearch moderation and signboard text extraction            | `backend/tests/test_photos.py` tests fixture image decoding and unit functions, but no Playwright E2E test runs full shopfront photo upload flow through UI                                                         | `tests/qa/shop-details.spec.ts`                                                            |
| **Step 21**      | Gallery photo upload from UI                                                               | `backend/tests/test_gallery.py` checks backend routes, but there is no Playwright test for uploading and viewing multiple gallery images in UI                                                                      | `tests/qa/shop-details.spec.ts`                                                            |
| **Step 22 & 23** | Close the day from Till Receipt & Stock count photos via UI                                | `backend/tests/test_day_close.py` tests backend endpoints (`/day/read`, `/day/prepare`), but no Playwright E2E spec tests the multi-photo upload and single-tap commit UI                                           | `tests/stories/customer-flow.spec.ts` or new `tests/qa/day-close.spec.ts`                  |
| **Step 24**      | Native `.xlsx` binary spreadsheet menu import                                              | `tests/qa/import-forecast.spec.ts` tests `.csv` upload only; binary Excel OpenXML format (`.xlsx`) parsing is tested only in backend unit tests, not via browser file input                                         | `tests/qa/import-forecast.spec.ts`                                                         |
| **Step 25**      | PDF document menu import                                                                   | Backend `backend/app/imports.py` supports PDF extraction, but no browser Playwright test exercises uploading a `.pdf` file through `ImportMenu.tsx`                                                                 | `tests/qa/import-forecast.spec.ts`                                                         |
| **Step 27**      | Customer instant AI ask from chat drawer                                                   | Customer search is tested via `tests/qa/customer.spec.ts`, but instant AI answers from the customer chat drawer (`ShopChat.tsx`) need E2E verification                                                              | `tests/customer-chat.spec.ts`                                                              |
| **Step 32**      | QR Stamp animation / celebration feedback on phone                                         | `tests/qa/rewards-settings.spec.ts` verifies stamp count text ("1 stamps"), but does not assert on the die-cut stamp motion/delight animation or visual stamp feedback                                              | `tests/stories/s8-passport.spec.ts`                                                        |
| **Step 37**      | PWA install dialog and dismissal without blocking web app                                  | `tests/qa/rewards-settings.spec.ts` tests install dialog text, but does not test PWA `beforeinstallprompt` event handling or manifest service-worker registration                                                   | `tests/qa/rewards-settings.spec.ts`                                                        |

---

## Detailed Gap Breakdown & Action Items

### 1. Voice Resilience & Error Handling (Steps 2, 5, 6, 7, 8, 9, 10, 15, 17)

- **Current State**: Automated test suites in `tests/stories/s10-new-shop.spec.ts` and `tests/qa/voice-continuity.spec.ts` test scripted flows and server sessions.
- **Missing Coverage**:
  1. Denied microphone permission triggering `VoiceAlert` with `kind: 'mic-blocked'`.
  2. Recovery flow clicking `Try again` after permissions are granted.
  3. Physical WebSocket disconnect recovery during active recording.
  4. Client-side echo cancellation / barge-in cutoff.
  5. Live browser reload while voice is connected and seamless continuity resumption.
- **Action**: Add dedicated tests in `tests/qa/voice-continuity.spec.ts` using Playwright's `context.grantPermissions([])` and `context.setOffline(true)`.

### 2. Multi-Format Visual & Document Intake (Steps 20, 21, 22, 23, 24, 25)

- **Current State**: Backend handles `.xlsx`, `.pdf`, `.jpg`, `.png` with unit tests in `backend/tests/test_imports.py`, `test_photos.py`, and `test_day_close.py`. Playwright tests in `tests/qa/import-forecast.spec.ts` only upload a single CSV file.
- **Missing Coverage**:
  1. Front-end upload of `.xlsx` binary file and `.pdf` document via file picker.
  2. Multi-photo day close flow (`/day/read` -> `/day/prepare` -> single tap approve).
  3. SafeSearch warning / rejection display in UI.
- **Action**: Add test fixtures (`sample-menu.xlsx`, `menu.pdf`, `till-receipt.jpg`) in `tests/stories/fixtures/` and expand `tests/qa/import-forecast.spec.ts` and `tests/qa/shop-details.spec.ts`.

### 3. Coach Rich Answer Cards & Customer Chat (Steps 16, 27)

- **Current State**: Backend `test_charts.py` tests forecast and insights card generation.
- **Missing Coverage**: Interactive rendering of chart cards in chat stream and customer instant answers.
- **Action**: Add Playwright assertions for SVG paths and accessibility data tables in `tests/forecast.spec.ts` and `tests/customer-chat.spec.ts`.
