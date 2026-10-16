I have completed the read-only bug sweep across the React frontend and FastAPI backend, focusing on the critical flows, voice interactions, and business logic highlighted in the owner intent files. The most pressing defects lie in the Voice Mode implementation, which severely violates the intended "mic always on" and continuous conversation experience by forcefully disconnecting after every turn and arbitrarily capping recordings. I also found logic errors in the menu updates that can spawn duplicate items, and a gap in the coaching agent's survey plan that continues to ask vegetarian shops about Halal status, contradicting the stated business rules.

### 1. Voice Mode Terminates Connection After Every Turn

**Severity:** Critical
**Area:** Owner Voice Onboarding / Coach Chat
**File:Line:** `src/features/v1/useVoice.ts:213`
**Scenario:** The owner begins a voice mode session as instructed by the design guidelines ("mic always on, reactive orb", "voice should continue the current conversation"). When the backend finishes answering a turn, it sends a `turn_complete` event. The frontend intercepts this and schedules a timeout to call `stop()`, which closes the WebSocket connection and releases the microphone entirely. The owner must manually click the Mic button again to continue, breaking the continuous conversation flow.
**Fix:** Remove the timeout that calls `stop()` on the `turn_complete` event in `useVoice.ts`. Instead, reset the UI state back to `idle` or `recording` so the microphone stays hot and the WebSocket remains open for the next utterance.

### 2. Voice Audio Loop/Garble on Interrupt

**Severity:** High
**Area:** Owner Voice Back / Audio Playback
**File:Line:** `src/features/v1/useVoice.ts:208`
**Scenario:** When the owner interrupts the AI's speech, the `interrupted` event is received. The code calls `audio.suspend()`, resets `current.next = 0`, and calls `audio.resume()`. However, previously scheduled `AudioBufferSourceNode`s are never stopped or disconnected. Since `audio.resume()` restarts the audio context, all previously scheduled buffers will immediately play simultaneously from their scheduled times, resulting in a garbled loop of overlapping audio.
**Fix:** Keep track of active `AudioBufferSourceNode` references (e.g., in an array). When an `interrupted` event occurs, iterate through these active sources and explicitly call `.stop()` and `.disconnect()` on them before resetting `current.next` and resuming the audio context.

### 3. Voice Mode Unconditionally Cuts Off After 30 Seconds

**Severity:** High
**Area:** Owner Voice Onboarding / Coach Chat
**File:Line:** `src/features/v1/useVoice.ts:203`
**Scenario:** While recording the owner's voice, `setTimeout(finishRecording, 30_000)` sets a strict 30-second deadline. If the owner takes longer than 30 seconds to explain their shop details (which is highly likely during the initial "grand full-screen" onboarding), the app abruptly cuts off the microphone, ends the audio stream, and submits a partial response to the AI.
**Fix:** Remove the strict 30-second `finishRecording` timeout, or increase it significantly (e.g., to 3–5 minutes) to act solely as a fallback safety net. Rely on the Gemini Live backend (which supports continuous audio streaming and native VAD) to detect the end of speech naturally.

### 4. Menu Updates Spawning Duplicate Items

**Severity:** Medium
**Area:** Owner AI Menu Management / `propose_products`
**File:Line:** `backend/app/coordinator.py:465` (inside `propose_products`)
**Scenario:** The owner has multiple items with the same name but different units (e.g., "Kaya Toast" as a `plate` and "Kaya Toast" as a `box`). The owner tells the AI to "update the price of Kaya Toast to 3.50". The model calls `propose_products` without specifying the exact unit, so `ProductInput` defaults to `unit="item"`. The backend logic `len(by_name.get(name, [])) == 1` evaluates to false. Because the fallback exact match `("kaya toast", "item")` does not exist, `known` becomes `None`. The backend creates a brand-new duplicate "Kaya Toast" instead of editing the existing ones or asking for clarification.
**Fix:** When `len(by_name.get(name, [])) > 1` and `known` is None, the `propose_products` tool should raise an explicit `ValueError` (caught by `_invalid`) to instruct the AI to ask the owner which unit they want to update, rather than silently falling through and treating it as a new product.

### 5. Halal Questions Asked for Vegetarian Shops

**Severity:** Medium
**Area:** Coach Question Planner
**File:Line:** `backend/app/coordinator.py:165` (inside `get_question_plan`)
**Scenario:** A shop's category or name clearly marks it as a Vegetarian restaurant, or the owner has previously confirmed `vegetarian_options: true`. The business rule strictly dictates "never halal for a vegetarian shop". However, the coach's `customer_facts_to_ask` checklist filters food-only facts merely by checking `serves_food(shop["fields"])`, which returns true for any food establishment. As a result, `halal` remains in the pending questions list and the AI asks the vegetarian owner if their food is Halal.
**Fix:** Update the list comprehension in `get_question_plan` to exclude `"halal"` if the shop's profile indicates it is vegetarian (e.g., by checking if `"vegetarian"` or `"veg"` is in the category/name, or if `vegetarian_options` is explicitly set to `True`).
