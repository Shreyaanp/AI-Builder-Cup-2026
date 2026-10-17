# Region persona: the shop's location decides money, language, payments and flows (account 4)

REPLACES and INCLUDES task-SG-LANGUAGES-E2E.md (do that too). Owner (17 Oct 05:10): "global location is not
solved. Based on the shop's location the persona is different: in India money is rupees and India's flows;
in Singapore, Singapore's. Followed through the customer AND vendor app. Ask the user for language after
sign-in, with the right default."

Branch fix/sg-languages-e2e (this worktree; first `git merge origin/fix/hindi-e2e`, PR #61). Ports
3859/3959, RECALL_PATH=data/test-vectors. NEVER run commands in the background; foreground only, batches
under 10 min; `--workers=1`; no parallel sub-agents; plain commits, no AI trailers. DO NOT edit
backend/app/voice.py, NewShopFlow.tsx, NewShopStage.tsx, VoiceStage.tsx, agent.py's onboarding section
(onboarding v2 owns them): forward any needed change in the PR description.

1. ONE region profile (backend + frontend, single source of truth), derived from the shop's pin (owner
   side) or the customer's area (customer side), with country detected by reverse geocoding/known bounds:
   - India: INR ₹ (Indian digit grouping 1,00,000), languages hi/en + regional (ta, kn, te, mr, bn…),
     payments UPI (QR/deep link), rides Rapido/Uber/Porter, units (kg, litre, cup), GST wording, dates.
   - Singapore: SGD S$, languages en/zh/ms/ta, payments PayNow/NETS/cards, rides Grab/Gojek, GST 9% wording.
   - Fallback for other countries: currency from locale, English, generic payments.
   Every place that shows money, payment/ride options, tax wording, suggested examples ("coffee under $3"),
   demo hints and AI prompts reads this profile. Remove every hard-coded SGD/"Asia/Singapore" default that
   leaks into India (shop default currency is SGD today in merchant.py; timezone default Asia/Singapore).
2. AI prompts get the region: replies use the region's currency, payments, units and examples.
3. Language after sign-in (owner and customer): a single "Choose your language" step right after sign-in,
   default = best guess from region + device language (India → Hindi or the regional language offered
   first, English always present; Singapore → English, with zh/ms/ta), one tap to confirm, changeable later
   in You. Stored once (the single preference) and used by voice (#55 reads it).
4. Singapore languages end to end (en-SG, zh, ms, ta) per the included brief, incl. the live Malay check.
5. Tests: region unit tests (pin → profile), India shop shows ₹/UPI/Hindi defaults, Singapore shop
   S$/PayNow/English, customer in India never sees SGD, language step after sign-in (owner + customer).
   docs/qa/region-persona.md. Push, PR (base main), summarise.
