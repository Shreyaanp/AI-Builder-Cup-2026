# Hindi must work everywhere, end to end, on live Gemini (account 4)

Owner (17 Oct): Hindi is the highest priority and must work right now. PR #55 pinned the voice language.
Now prove and fix Hindi across the WHOLE app. Branch fix/hindi-e2e from origin/release/stable-2-main (has
#55's fix as 7b49351). Ports WEB_PORT=3845 API_PORT=3945. NEVER run commands in the background; foreground
only, batches under 10 min; `--workers=1`; no parallel sub-agents; plain commits, no AI trailers.
DO NOT touch backend/app/voice.py, src/features/v1/NewShopFlow.tsx, NewShopStage.tsx, VoiceStage.tsx
(account 3 is fixing voice drops/repeats in fix/voice-reliability); report findings there instead.

1. With the app set to Hindi (hi-IN) at 360px, walk every owner flow (Today, coach text, Shop/Grow/You,
   menu photo, Close the day typed + photo, rescue, payments link, purchase order, playbook, face check,
   privacy) and every customer flow (front door Ask, results, shop page, chat, stamps, passport). Use LIVE
   Gemini for the coach/Ask/translation paths (owner's gcloud credentials; keep it to one pass, small cost)
   and offline mode for the rest.
2. Find: English or other-language strings left in Hindi UI, replies not in Hindi, Bhojpuri/Urdu drift,
   numbers/currency/dates not in hi-IN format, broken Devanagari line wrapping/clipping, TTS voice back not
   Hindi, translations of owner content wrong, mixed-script buttons, placeholders in English.
3. Fix everything that is not in the forbidden voice files (strings in all locale files where a key is
   missing everywhere, Intl formatting, prompts of the text coach/Ask/translation pinning hi-IN).
4. Tests: a Hindi locale spec covering the main owner + customer screens (no Latin-only UI strings except
   allowed brand/units; ₹ formatting; no overflow at 360px); backend tests for prompt language pinning.
5. docs/qa/hindi-e2e.md: flow → finding → fixed/forwarded, with screenshots. Push, PR (base main), summarise.
