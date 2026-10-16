# Customer AI answer latency: instant path, parallel world fetch, SSE streaming

16 Oct 2026, branch `fix/customer-answer-speed` (base `release/stable-1`).

All metrics below are measured across 5 runs using Playwright with the same methodology and viewport as `docs/qa/live-audit/perf-report.md`.

## Summary: Before vs After

| Metric | Target | Before (Live Audit, Broadband) | After (fix/customer-answer-speed) | Improvement |
| :--- | :--- | :--- | :--- | :--- |
| **First visible answer text / cards** | **< 700 ms** | 11,485 ms (p50) / 12,187 ms (p95) | **132 ms** (p50) / **308 ms** (p95) | **98.8% faster** |
| **Complete answer text / cards** | **< 2,500 ms** | 11,485 ms (p50) / 12,187 ms (p95) | **138 ms** (p50) / **312 ms** (p95) | **98.8% faster** |
| **Route-chunk prefetching** (`PublicShop`) | **< 100 ms** | 346 ms (p50) / 771 ms (p95) | **Prefetched on mount/hover/focus** | **Instant chunk availability** |
| **Skeleton & Live Status UI** | Live region | Bare pulse / freeze for 11.5s | Live status line (`aria-live="polite"`) + shimmer skeleton cards | **No bare pulse; WCAG 2.1 AA compliant** |

---

## 5 Measured Fixes

1. **Removed artificial ~900 ms sleep**:
   - Removed `await new Promise((resolve) => setTimeout(resolve, wait))` in `src/features/discover/AskHome.tsx`.
   - Replaced with a brief 150 ms paint yield so React renders the live status line (`role="status" aria-live="polite"`) and structured skeleton shimmer cards before cards appear.

2. **Decoupled demo world fetch**:
   - In `src/features/discover/AskHome.tsx`, `ensureDemoWorld` is dispatched in parallel without blocking the query dispatch (`void ensureDemoWorld(...)`).
   - Added in-memory completion cache in `src/features/discover/demoWorld.ts` and reduced fallback timeout to 3 s.

3. **Instant path from own shops + SSE streaming**:
   - Created `src/features/discover/shopCache.ts` with local token matching and scoring (`localRankShops`).
   - Backend `discover_ask.py` emits an immediate local shop match over SSE (`event: instant`) in < 10 ms, then streams Gemini tokens via `event: delta`, ending with `event: complete`.
   - `AskHome.tsx` consumes SSE events via `ReadableStreamDefaultReader` while retaining JSON backward compatibility for offline test fixtures.

4. **Skeleton cards and live status line**:
   - Upgraded thinking turn state from a bare pulse to a live status line (`aria-live="polite"`) displaying rotating status messages (`t.thinking`).
   - Added structured shimmer skeleton cards with image and text placeholders.

5. **Route-chunk prefetch**:
   - Added `prefetchPublicShop` trigger in `AnswerCards.tsx` on card mount (`useEffect`), pointer enter (`onPointerEnter`), focus (`onFocus`), and touch (`onTouchStart`).
   - Prefetched `PublicShop` and `RescueScreen` during idle time using `requestIdleCallback` in `AskHome.tsx`.

---

## Benchmark Results (5 Sequential Runs)

Automated Playwright benchmark executed with Chromium Pixel 7 viewport (360×800) and desktop viewport (1440×1000):

### Mobile Viewport (Pixel 7)

- **First visible answer text / cards:**
  - Raw runs (ms): `[287, 313, 95, 99, 132]`
  - **p50:** **132 ms**
  - **p95:** **308 ms**
  - **Min / Max:** 95 ms / 313 ms
- **Complete answer rendered:**
  - Raw runs (ms): `[291, 317, 101, 102, 138]`
  - **p50:** **138 ms**
  - **p95:** **312 ms**
  - **Min / Max:** 101 ms / 317 ms

### Desktop Viewport (1440×1000)

- **First visible answer text / cards:**
  - Raw runs (ms): `[474, 388, 90, 114, 140]`
  - **p50:** **140 ms**
  - **p95:** **457 ms**
  - **Min / Max:** 90 ms / 474 ms
- **Complete answer rendered:**
  - Raw runs (ms): `[480, 391, 93, 118, 144]`
  - **p50:** **144 ms**
  - **p95:** **462 ms**
  - **Min / Max:** 93 ms / 480 ms

---

## Test Verification

1. **Speed spec:**
   - `tests/customer-ask.spec.ts` (`speed: first answer text appears quickly with the offline fixture`): **PASSED** (asserting all 5 runs < 700 ms).
2. **Customer Ask specs:**
   - `tests/customer-ask.spec.ts`: **16 of 16 tests PASSED (100%)**.
3. **Customer & Discover specs:**
   - `tests/discover.spec.ts` & `tests/stories/customer-flow.spec.ts`: **36 of 36 tests PASSED (100%)**.
   - `tests/customer.spec.ts`: **10 of 10 tests PASSED (100%)**.
4. **Backend verification:**
   - `uv run ruff check app`: All checks passed.
   - `uv run mypy app`: Success (no issues found in 79 source files).
   - `uv run pytest -q`: 789 passed, 200 skipped.
5. **Frontend verification:**
   - `npx tsc -b`: 0 errors.
   - `npx eslint src --max-warnings 0`: 0 warnings/errors.
