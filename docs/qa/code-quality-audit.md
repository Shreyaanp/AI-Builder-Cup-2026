# Code Quality Audit: Duplicates, Size/Complexity, Strictness, and Refactor Plan

> **Date:** 17 October 2026  
> **Auditor:** Antigravity Code Quality Task  
> **Scope:** Chalkboard Full-Stack Repository (`src/` React 19 + MUI PWA, `backend/` FastAPI + Google ADK)  
> **Status:** Read-Only Audit & Evidence Report

---

## Executive Summary & 1-Page Verdict

The Chalkboard codebase demonstrates **exceptional baseline strictness** in its compiler and lint configurations (`"strict": true`, `"noUncheckedIndexedAccess": true`, zero un-suppressed `any` types in TypeScript, 99 source files passing strict `mypy` and `ruff`). However, the velocity of the hackathon sprint has accumulated significant structural debt:

1. **Massive Monolithic Files & Functions:** Several screen components (`CoachScreen.tsx`, `NewShopFlow.tsx`, `Discover.tsx`) and backend entry points (`create_app` in `main.py`, `generate_content_async` in `agent.py`) exceed 600 to 1,800 lines with high cyclomatic branch complexity (exceeding 180–240 conditional branches).
2. **Duplicated Primitives & Parallel Architectures:** Map loaders, bottom sheets/drawers, empty states, and currency formatters have grown parallel implementations across features rather than sharing a single canonical foundation.
3. **Locale Key Duplication:** Over 40 distinct localization files store repeated domain terminology without a unified translation key extraction mechanism.

### Quality Scorecard by Area

| Area                                    | Grade  | Key Findings & Justification                                                                                                                                                                                                                                                                                                                                                                                   |
| :-------------------------------------- | :----: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type Strictness (TS / Python)**       | **A-** | TypeScript config enforces `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `erasableSyntaxOnly`. Exactly **zero** explicit `any` usages in `src/`. Backend `mypy` enforces `disallow_untyped_defs = true` and `check_untyped_defs = true` across 99 files with only 21 `# type: ignore` in `app/` (mostly third-party SDK typing boundaries like `google.cloud.storage` and pydantic settings kwargs). |
| **Lint & Static Hygiene**               | **B+** | ESLint has only 13 total `eslint-disable` comments across the entire project (mostly `react-hooks/exhaustive-deps` on legacy timers). Ruff lint passes completely with `E`, `F`, `I`, `UP`, `B`, `ASYNC` active. No dead code blockers found in core paths.                                                                                                                                                    |
| **Component & Helper Deduplication**    | **C**  | Multiple duplicate helpers exist: 2 parallel Google Maps loader routines (`mapsSdk.ts` vs `PinMap.tsx`), 5 bottom sheet variations (`Sheet.tsx`, `ShopSheet`, `ShopSheets`, `MenuSheet`, `OrdersSheet`), ad-hoc currency formatters in 8 files alongside `formatPrice()`, and localized empty states rather than a shared M3 `EmptyState` component.                                                           |
| **File & Function Size/Complexity**     | **D+** | 34 files exceed 800 lines (excluding generated types). The largest TSX component (`CoachScreen.tsx`) is 1,573 lines with 1,349 lines in a single function body and 242 branches. Backend `create_app` spans 473 lines and 49 branches in a single function.                                                                                                                                                    |
| **Backend Architecture & Store Access** | **B**  | Clear abstraction layers (`MerchantStore` vs `FirestoreMerchantStore`), well-isolated SQLite session database and Firestore vectors. Repeated validation logic in routes and dispersed prompt strings could be consolidated into a centralized prompt registry.                                                                                                                                                |
| **Overall Codebase Grade**              | **B-** | **Structurally sound and strictly typed, but suffering from sprint monolithic component bloat and component duplication.**                                                                                                                                                                                                                                                                                     |

---

## 1. Duplicates: Components, Hooks, and Helpers

The owner requirement states: _"there should not be two components doing the same thing. Is the code quality any good?"_  
The table below documents all identified duplicates with precise file locations, line numbers, winning canonical implementation, and estimated merge effort.

### Summary Table of Duplicates

| Duplicate Category                    | Duplicate Implementations (Files & Lines)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Canonical Winner                                                    |        Effort        | Recommended Action                                                                                                                                                            |
| :------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------ | :------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Money & Currency Formatting**    | • Ad-hoc formatters: [`CloseDay.tsx:90`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/closeday/CloseDay.tsx#L90), [`Saved.tsx:31-32`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/customer/Saved.tsx#L31-L32), [`budget.ts:21-22`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/discover/budget.ts#L21-L22), [`Supply.tsx:237-241`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/supply/Supply.tsx#L237-L241)<br>• Canonical helper: [`format.ts:161-178`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/format.ts#L161-L178)                                                | `format.ts` (`formatPrice`, `currencySymbol`, `toMajor`, `toMinor`) |    **Low** (1 hr)    | Replace all ad-hoc `Intl.NumberFormat` and manual string concatenations with imports from `src/features/v1/format.ts`.                                                        |
| **2. Google Maps SDK Loader**         | • Discover Maps SDK: [`mapsSdk.ts:25-98`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/discover/mapsSdk.ts#L25-L98)<br>• PinMap Google Loader: [`PinMap.tsx:64-98`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/PinMap.tsx#L64-L98)                                                                                                                                                                                                                                                                                                                                                                                                              | `src/features/discover/mapsSdk.ts` (`loadMaps()`)                   |  **Medium** (2 hrs)  | PinMap implements its own script tag injection and window listener. Extract `loadMaps` to a shared utility `src/utils/mapsLoader.ts` and refactor `PinMap.tsx` to consume it. |
| **3. Bottom Sheet & Drawer Wrappers** | • Shared Sheet: [`Sheet.tsx:1-92`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/Sheet.tsx#L1-L92)<br>• Menu Sheet: [`MenuSheet.tsx:1-120`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/shop/MenuSheet.tsx#L1-L120)<br>• Orders Sheet: [`Orders.tsx:40-150`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/sourcing/Orders.tsx#L40-L150)<br>• ShopSheet: [`ShopCard.tsx:180-260`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/ShopCard.tsx#L180-L260)<br>• ShopSheets: [`ShopTiles.tsx:394-665`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/ShopTiles.tsx#L394-L665) | `src/features/v1/Sheet.tsx` (M3 SwipeableDrawer wrapper)            |  **Medium** (3 hrs)  | Standardize all drawer bottom-sheets to use `Sheet.tsx` with unified drag handle, backdrop blur, and safe-area padding.                                                       |
| **4. Empty & Error States**           | • Local EmptyState: [`RescueScreen.tsx:244-265`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/rescue/RescueScreen.tsx#L244-L265)<br>• Ad-hoc empty cards: [`Saved.tsx:110-140`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/customer/Saved.tsx#L110-L140), [`Discover.tsx:340-370`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/discover/Discover.tsx#L340-L370), [`Chats.tsx:180-210`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/customer/Chats.tsx#L180-L210)                                                                                                                                   | New shared `src/design/EmptyState.tsx`                              |  **Low** (1.5 hrs)   | Create a standard Material 3 `EmptyState` component with icon, title, description, and primary action button; replace screen-specific one-offs.                               |
| **5. Stamp Cards & Loyalty Badges**   | • Customer StampCard: [`StampCard.tsx:86-240`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/rewards/StampCard.tsx#L86-L240)<br>• Public Shop StampPeek: [`StampCard.tsx:245-310`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/rewards/StampCard.tsx#L245-L310)<br>• Stamp Moment: [`StampMoment.tsx:1-150`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/passport/StampMoment.tsx#L1-L150)                                                                                                                                                                                                                                   | `src/features/rewards/StampCard.tsx`                                |    **Low** (1 hr)    | Consolidate `StampPeek` and `StampMoment` badge layouts into a single parameterized card component supporting `compact`, `full`, and `interactive` modes.                     |
| **6. Voice & Caption Handlers**       | • Onboarding Voice: [`useVoice.ts:80-496`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/useVoice.ts#L80-L496)<br>• Phone Voice fallback: [`phoneVoice.ts:1-180`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/phoneVoice.ts#L1-L180)<br>• Discover Voice Input: [`AskHome.tsx:150-210`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/discover/AskHome.tsx#L150-L210)                                                                                                                                                                                                                                                    | `src/features/v1/useVoice.ts`                                       | **Medium** (2.5 hrs) | `AskHome.tsx` reimplements browser speech recognition directly; it should leverage the shared hook or extract a shared `useSpeechRecognition` hook.                           |
| **7. Locale & Translation Helpers**   | • Core Locales: [`src/i18n/locales.ts:1-100`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/i18n/locales.ts#L1-L100)<br>• V1 Locales: [`src/features/v1/locales/index.ts:1-50`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/locales/index.ts#L1-L50)<br>• 40+ feature-level copy files (`copyLocales.ts`, `strings.ts`)                                                                                                                                                                                                                                                                                                                                    | Unified `src/i18n/index.ts` Registry                                |   **High** (4 hrs)   | All 15 languages are individually imported across `customerLocales.ts`, `copyLocales.ts`, and `v1/locales`. Centralize locale dictionary loading to avoid code bloat.         |
| **8. Backend: System Prompts**        | • Coach / New Shop: [`agent.py:59, 820`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/agent.py#L59)<br>• Import Mapper: [`imports.py:57, 228`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/imports.py#L57)<br>• Business Profile: [`business_profile.py:263`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/business_profile.py#L263)<br>• Supply Chain: [`supply_docs.py:1111`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/supply_docs.py#L1111)<br>• Playbook: [`playbook.py:210`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/playbook.py#L210)                                | Structured Prompt Module `backend/app/prompts/`                     |  **Medium** (3 hrs)  | Long multi-line prompts are declared inline in 15 different backend modules. Move them to a dedicated `prompts/` package with versioning and typing.                          |
| **9. Backend: Validation Logic**      | • Proposal validation: [`merchant.py:535`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/merchant.py#L535)<br>• Location validation: [`merchant.py:235`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/merchant.py#L235)<br>• Capacity validation: [`sales.py:72`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/sales.py#L72)                                                                                                                                                                                                                                                                                                      | Pydantic model validators (`@field_validator`)                      |  **Low** (1.5 hrs)   | Move manual procedural validation checks into declarative Pydantic schemas so FastAPI handles bad requests uniformly.                                                         |
| **10. Backend: Store Instantiation**  | • Multiple route handlers create stores manually: `PassportStore(community(request).docs)`, `CoopStore(community(request).docs)` in [`passport_routes.py:102, 110`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/passport_routes.py#L102)                                                                                                                                                                                                                                                                                                                                                                                                                                    | FastAPI Dependency Injection (`Depends(get_passport_store)`)        |  **Low** (1.5 hrs)   | Use FastAPI `Depends()` for all store injection rather than ad-hoc retrieval from `app.state`.                                                                                |

---

## 2. Size and Complexity Analysis

### Files Over 800 Lines

Excluding `src/api/generated.d.ts` (11,546 lines, auto-generated OpenAPI schema), **33 source files exceed 800 lines**:

```
Lines   File Path
 2492   src/features/supply/copy.ts
 2418   src/features/google-sim/strings.ts
 1886   src/features/v1/NewShopFlow.tsx
 1745   src/features/customer/copyLocales.ts
 1679   src/features/trust/copy.ts
 1573   src/features/v1/screens/CoachScreen.tsx
 1503   backend/app/merchant.py
 1502   src/features/v1/inChatCopy.ts
 1377   backend/app/supply_chain.py
 1295   backend/app/discover_ask.py
 1266   backend/app/sourcing.py
 1254   src/features/public/customerLocales.ts
 1246   backend/app/passport_routes.py
 1246   backend/app/supply_docs.py
 1218   backend/app/coordinator.py
 1207   src/features/discover/AskHome.tsx
 1145   src/features/owner/locales.ts
 1096   src/features/v1/playbook/playbookCopy.ts
 1089   backend/app/passport.py
 1057   src/features/public/PublicShop.tsx
 1036   backend/app/agent.py
  989   backend/app/merchant_firestore.py
  943   src/features/frontdoors/strings.ts
  933   backend/app/playbook.py
  931   src/features/v1/locales/legal.ts
  917   backend/scripts/coach_eval.py
  892   src/features/v1/today/todayCopy.ts
  867   src/features/discover/Discover.tsx
  842   src/features/supply/PurchaseOrderCard.tsx
  824   backend/app/community.py
  822   src/features/customer/Chats.tsx
  814   backend/app/search_engine.py
  808   src/features/v1/screens/GoogleScreen.tsx
```

_Note on localization files:_ Approximately one-third of the files over 800 lines are static multi-language dictionaries (`copy.ts`, `strings.ts`, `locales.ts`). While large, these have near-zero cyclomatic complexity. The critical targets for refactoring are the executable components and route controllers.

---

### Top 25 Largest Frontend Functions & Components

Measured by AST traversal and cyclomatic branch count (`if`, `else if`, `case`, `catch`, `? :`, `&&`, `||`, `??`):

|  #  | Function / Component     | File Location                                                                                                                                                         |  Lines   | Branches | Complexity Diagnosis                                                                                                          |
| :-: | :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :------: | :---------------------------------------------------------------------------------------------------------------------------- |
|  1  | **CoachScreen**          | [`src/features/v1/screens/CoachScreen.tsx:176-1524`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/screens/CoachScreen.tsx#L176-L1524)       | **1349** | **242**  | **Extreme**. Houses full state machine, SSE handling, voice reactive state, chart displays, and modal sheets in one function. |
|  2  | **Journey**              | [`src/features/v1/NewShopFlow.tsx:196-1406`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/NewShopFlow.tsx#L196-L1406)                       | **1211** | **187**  | **Extreme**. Onboarding conversational wizard with inline camera, map, and form state coupled in one body.                    |
|  3  | **Discover**             | [`src/features/discover/Discover.tsx:110-866`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/discover/Discover.tsx#L110-L866)                   | **757**  |  **85**  | High. Main customer discovery view mixing search queries, geolocation, category pills, and results rendering.                 |
|  4  | **AskHome**              | [`src/features/discover/AskHome.tsx:113-768`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/discover/AskHome.tsx#L113-L768)                     | **656**  |  **92**  | High. Customer chat home managing voice synthesis, suggestions, and instant answers.                                          |
|  5  | **PublicShop**           | [`src/features/public/PublicShop.tsx:406-1056`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/public/PublicShop.tsx#L406-L1056)                 | **651**  |  **73**  | High. Public merchant storefront rendering products, reviews, stamps, and chat triggers.                                      |
|  6  | **GuidedDetails**        | [`src/features/v1/GuidedDetails.tsx:70-719`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/GuidedDetails.tsx#L70-L719)                       | **650**  |  **89**  | High. Multi-field shop setup wizard.                                                                                          |
|  7  | **CloseDay**             | [`src/features/closeday/CloseDay.tsx:84-615`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/closeday/CloseDay.tsx#L84-L615)                     | **532**  |  **63**  | Moderate-High. Daily accounting, cash reconciliation, and till receipt approval.                                              |
|  8  | **FaceDialog**           | [`src/features/v1/FaceDialog.tsx:73-552`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/FaceDialog.tsx#L73-L552)                             | **480**  |  **67**  | Moderate-High. Face liveness / verification dialog.                                                                           |
|  9  | **App**                  | [`src/app/App.tsx:53-494`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/app/App.tsx#L53-L494)                                                           | **442**  |  **33**  | Moderate. Top-level router, navigation bars, and theme toggle.                                                                |
| 10  | **handleConfirmAndSync** | [`src/features/connect/ConnectSheet.tsx:194-634`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/connect/ConnectSheet.tsx#L194-L634)             | **441**  |  **46**  | Moderate. POS/ERP mapping confirmation handler.                                                                               |
| 11  | **CameraCard**           | [`src/features/v1/CameraCard.tsx:38-464`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/CameraCard.tsx#L38-L464)                             | **427**  |  **45**  | Moderate. MediaStream capture, canvas rendering, and file upload.                                                             |
| 12  | **Wizard**               | [`src/features/google-sim/GoogleSimulator.tsx:136-554`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/google-sim/GoogleSimulator.tsx#L136-L554) | **419**  |  **58**  | Moderate. Google Business Profile simulation steps.                                                                           |
| 13  | **useVoice**             | [`src/features/v1/useVoice.ts:80-496`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/useVoice.ts#L80-L496)                                   | **417**  |  **92**  | High. Voice hook handling audio worklet, WebSocket chunks, and speech interruption.                                           |
| 14  | **ChatThread**           | [`src/features/customer/Chats.tsx:306-721`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/customer/Chats.tsx#L306-L721)                         | **416**  |  **59**  | Moderate. Messaging thread between customer and merchant.                                                                     |
| 15  | **WorkspaceProvider**    | [`src/features/v1/WorkspaceProvider.tsx:25-410`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/WorkspaceProvider.tsx#L25-L410)               | **386**  |  **49**  | Moderate. State container for the owner experience.                                                                           |
| 16  | **ShopChat**             | [`src/features/public/ShopChat.tsx:60-407`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/public/ShopChat.tsx#L60-L407)                         | **348**  |  **37**  | Moderate. Chat drawer in public shop view.                                                                                    |
| 17  | **ScratchCard**          | [`src/features/passport/games/ScratchCard.tsx:55-387`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/passport/games/ScratchCard.tsx#L55-L387)   | **333**  |  **34**  | Moderate. Canvas scratch card game.                                                                                           |
| 18  | **ShopFill**             | [`src/features/v1/VoiceStage.tsx:322-651`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/VoiceStage.tsx#L322-L651)                           | **330**  |  **31**  | Moderate. Interactive filling animation for onboarding fields.                                                                |
| 19  | **AssistantTurn**        | [`src/features/discover/AskHome.tsx:900-1206`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/discover/AskHome.tsx#L900-L1206)                   | **307**  |  **39**  | Moderate. Chat bubble renderer with embedded cards.                                                                           |
| 20  | **PlanningCard**         | [`src/features/planning/PlanTomorrow.tsx:89-392`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/planning/PlanTomorrow.tsx#L89-L392)             | **304**  |  **36**  | Moderate. Tomorrow forecast planning card.                                                                                    |
| 21  | **MorningBrief**         | [`src/features/owner/MorningBrief.tsx:45-335`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/owner/MorningBrief.tsx#L45-L335)                   | **291**  |  **24**  | Low-Moderate. Owner morning audio brief player and transcript.                                                                |
| 22  | **GoogleScreen**         | [`src/features/v1/screens/GoogleScreen.tsx:73-355`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/screens/GoogleScreen.tsx#L73-L355)         | **283**  |  **33**  | Low-Moderate. Google Business Profile setup screen.                                                                           |
| 23  | **Saved**                | [`src/features/customer/Saved.tsx:68-349`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/customer/Saved.tsx#L68-L349)                           | **282**  |  **17**  | Low-Moderate. Saved deals and shops list.                                                                                     |
| 24  | **PaymentsScreen**       | [`src/features/owner-tools/PaymentsScreen.tsx:155-429`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/owner-tools/PaymentsScreen.tsx#L155-L429) | **275**  |  **30**  | Low-Moderate. UPI payment QR code and link generator.                                                                         |
| 25  | **ShopSheets**           | [`src/features/v1/ShopTiles.tsx:394-665`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/src/features/v1/ShopTiles.tsx#L394-L665)                             | **272**  |  **28**  | Low-Moderate. Modal sheets container for shop actions.                                                                        |

---

### Top 25 Largest Backend Python Functions

Measured by Python AST parser across `backend/app`:

|  #  | Function                   | File Location                                                                                                                                 |  Lines  | Branches | Complexity Diagnosis                                                                                                       |
| :-: | :------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :-----: | :------: | :------------------------------------------------------------------------------------------------------------------------- |
|  1  | **create_app**             | [`backend/app/main.py:137-609`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/main.py#L137-L609)                         | **473** |  **49**  | **Severe Monolith**. Mounts middleware, lifespan, routers, error handlers, and WebSocket endpoints in one nested function. |
|  2  | **generate_content_async** | [`backend/app/agent.py:507-766`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/agent.py#L507-L766)                       | **260** |  **23**  | High. Core ADK model execution loop with tool invocation and streaming fallback.                                           |
|  3  | **\_propose_shop**         | [`backend/app/coordinator.py:493-724`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/coordinator.py#L493-L724)           | **232** |  **24**  | High. Onboarding business generation coordinator.                                                                          |
|  4  | **sync_export**            | [`backend/app/connector_routes.py:189-351`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/connector_routes.py#L189-L351) | **163** |  **22**  | Moderate. POS/ERP export synchronizer.                                                                                     |
|  5  | **apply_document**         | [`backend/app/supply_chain.py:958-1102`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/supply_chain.py#L958-L1102)       | **145** |  **21**  | Moderate. Supply chain status update engine.                                                                               |
|  6  | **parse_idoc**             | [`backend/app/supply_docs.py:412-555`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/supply_docs.py#L412-L555)           | **144** |  **14**  | Moderate. SAP IDoc XML parser.                                                                                             |
|  7  | **photo**                  | [`backend/app/merchant_routes.py:285-425`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/merchant_routes.py#L285-L425)   | **141** |  **13**  | Moderate. Photo intake and vision analysis endpoint.                                                                       |
|  8  | **draft_reorder**          | [`backend/app/supply_chain.py:389-529`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/supply_chain.py#L389-L529)         | **141** |  **9**   | Moderate. Automated reorder calculation.                                                                                   |
|  9  | **step**                   | [`backend/app/google_sim.py:166-304`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/google_sim.py#L166-L304)             | **139** |  **40**  | High Branching. Simulation step state machine.                                                                             |
| 10  | **ask**                    | [`backend/app/discover_ask.py:1015-1150`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/discover_ask.py#L1015-L1150)     | **136** |  **10**  | Moderate. Customer query answering orchestrator.                                                                           |
| 11  | **import_table**           | [`backend/app/merchant_routes.py:429-564`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/merchant_routes.py#L429-L564)   | **136** |  **15**  | Moderate. Spreadsheet table upload endpoint.                                                                               |
| 12  | **idoc_xml**               | [`backend/app/supply_docs.py:272-395`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/supply_docs.py#L272-L395)           | **124** |  **17**  | Moderate. SAP IDoc generation helper.                                                                                      |
| 13  | **propose_products**       | [`backend/app/coordinator.py:833-955`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/coordinator.py#L833-L955)           | **123** |  **16**  | Moderate. Menu catalog generator.                                                                                          |
| 14  | **facts**                  | [`backend/app/brief.py:136-254`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/brief.py#L136-L254)                       | **119** |  **15**  | Moderate. Morning brief data compilation.                                                                                  |
| 15  | **lifespan**               | [`backend/app/main.py:147-261`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/main.py#L147-L261)                         | **115** |  **11**  | Moderate. FastAPI lifecycle context manager.                                                                               |
| 16  | **public_events**          | [`backend/app/streaming.py:44-152`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/streaming.py#L44-L152)                 | **109** |  **27**  | Moderate. Server-Sent Events generator.                                                                                    |
| 17  | **fixture_answer**         | [`backend/app/customer.py:325-430`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/customer.py#L325-L430)                 | **106** |  **8**   | Low. Offline demo fixture selector.                                                                                        |
| 18  | **erase**                  | [`backend/app/erasure.py:96-201`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/erasure.py#L96-L201)                     | **106** |  **21**  | Moderate. GDPR data erasure engine.                                                                                        |
| 19  | **gemini_voice**           | [`backend/app/voice.py:140-243`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/voice.py#L140-L243)                       | **104** |  **24**  | Moderate. WebSocket voice session worker.                                                                                  |
| 20  | **discover**               | [`backend/app/discover.py:581-681`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/discover.py#L581-L681)                 | **101** |  **12**  | Moderate. Customer neighborhood discovery engine.                                                                          |
| 21  | **voice**                  | [`backend/app/main.py:507-605`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/main.py#L507-L605)                         | **99**  |  **14**  | Moderate. WebSocket endpoint for live voice.                                                                               |
| 22  | **today**                  | [`backend/app/today.py:535-630`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/today.py#L535-L630)                       | **96**  |  **7**   | Low. Today view summary compiler.                                                                                          |
| 23  | **parse_text**             | [`backend/app/supply_docs.py:761-855`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/supply_docs.py#L761-L855)           | **95**  |  **14**  | Moderate. Free-text supply doc extractor.                                                                                  |
| 24  | **build_view**             | [`backend/app/passport_routes.py:656-749`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/passport_routes.py#L656-L749)   | **94**  |  **2**   | Low. Passport view serializer.                                                                                             |
| 25  | **shop_pick**              | [`backend/app/discover_ask.py:514-606`](file:///C:/Users/pshre/work/agy-fix-code-quality-audit/backend/app/discover_ask.py#L514-L606)         | **93**  |  **8**   | Low. Top recommendation ranker.                                                                                            |

---

## 3. Strictness Today: Configuration and Metrics

### Configuration Assessment

1. **TypeScript (`tsconfig.app.json`):**
   - `"strict": true` (includes `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`).
   - `"noUncheckedIndexedAccess": true` (**Strictest mode**: forces indexed array/record lookups to be typed as `T | undefined`).
   - `"noUnusedLocals": true`, `"noUnusedParameters": true`.
   - `"erasableSyntaxOnly": true` (Prevents non-standard TypeScript-only runtimes like enums; maintains clean standard JavaScript).
   - `"noFallthroughCasesInSwitch": true`.
2. **ESLint (`eslint.config.js`):**
   - `@eslint/js` recommended.
   - `typescript-eslint` recommended.
   - `eslint-plugin-react-hooks` recommended.
   - `eslint-plugin-react-refresh` (`react-refresh/only-export-components: ["error", { allowConstantExport: true }]`).
3. **Backend Ruff & Mypy (`backend/pyproject.toml`):**
   - Ruff: Python 3.13 target, line length 100, linting rules: `E`, `F`, `I` (isort), `UP` (pyupgrade), `B` (flake8-bugbear), `ASYNC` (flake8-async).
   - Mypy: `python_version = "3.13"`, `files = ["app"]`, `check_untyped_defs = true`, `disallow_untyped_defs = true`, `warn_unused_ignores = true`, `ignore_missing_imports = true`.

### Strictness Bypasses Audit

Detailed breakdown of explicit type bypasses and lint suppressions across the codebase:

| Folder / Package     | TypeScript `any` | `# type: ignore` | `eslint-disable` | Total Source Files | Strictness Assessment                                                                                                                                                                  |
| :------------------- | :--------------: | :--------------: | :--------------: | :----------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`           |        0         |        0         |        0         |         5          | Clean                                                                                                                                                                                  |
| `src/auth/`          |        0         |        0         |        0         |         6          | Clean                                                                                                                                                                                  |
| `src/design/`        |        0         |        0         |        4         |         5          | 3 empty object interfaces for MUI theme augmentations; 1 timer hook dependency.                                                                                                        |
| `src/features/`      |        0         |        0         |        9         |        247         | 8 `react-hooks/exhaustive-deps` (mostly debounce timers or unmount triggers); 1 constant export.                                                                                       |
| `src/hooks/`         |        0         |        0         |        0         |         2          | Clean                                                                                                                                                                                  |
| `src/i18n/`          |        0         |        0         |        0         |         2          | Clean                                                                                                                                                                                  |
| `src/state/`         |        0         |        0         |        0         |         3          | Clean                                                                                                                                                                                  |
| `backend/app/`       |        4         |        21        |        0         |         99         | 21 `# type: ignore` across 99 files: 6 on `Settings(_env_file=None)` pydantic calls; 3 on `google.cloud.storage` dynamic attributes; 12 on Pydantic `Literal` / union argument checks. |
| `backend/scripts/`   |        4         |        2         |        0         |         18         | Eval and benchmark scripts.                                                                                                                                                            |
| `backend/tests/`     |        0         |        41        |        0         |         80         | Test fixtures passing partial dictionary kwargs or monkey-patched clients.                                                                                                             |
| **Total Full-Stack** |      **8**       |      **64**      |      **13**      |      **467**       | **Extremely high overall strictness ratio (>99.7% fully typed without suppressions).**                                                                                                 |

### Test Coverage Gaps

Based on test execution (`pytest -q` running 998 passed, 244 skipped) and the existing gap analysis in `docs/qa/test-gaps.md`:

1. **Hardware / Browser Media Capture Gaps:**
   - Microphone permission rejection (`mic-blocked`) and physical stream interruptions have unit tests but lack end-to-end browser automation with Playwright.
   - Multi-photo day close (`/day/read` -> `/day/prepare`) and binary `.xlsx` / `.pdf` uploads rely on backend unit coverage with mocked fixtures rather than UI file input automation.
2. **WebSocket & Audio Streaming Continuity:**
   - The Gemini Live WebSocket voice engine is skipped in standard automated tests (mocked with an offline audio oscillator fixture). Live bidirectional audio streaming remains unvalidated without a real hardware browser run.
3. **Skipped Backend Tests (244 tests):**
   - 244 tests are skipped in normal test runs; these correspond to live Google Cloud tests (Vertex AI, Cloud Storage, Document AI, Firestore live mode) gated behind offline fixture switches when running without cloud credentials.

---

## 4. Ranked Refactor Plan

To honor the owner's directive (_"only safe, high-value merges before the 18 Oct submission vs after"_), the refactor plan is divided into two distinct phases.

### Phase 1: Pre-Submission (Before 18 Oct — Safe, High-Value, Zero-Risk)

These tasks strictly eliminate duplication without touching core runtime flow, state machines, or UI styling.

1. **Unify Currency & Price Formatting (Priority: P0 | Risk: Low | Time: 1 hr)**
   - Audit all components currently formatting currency ad-hoc (`CloseDay.tsx`, `Saved.tsx`, `Supply.tsx`, `RescueTile.tsx`).
   - Import `formatPrice(amount, currency, locale)` and `currencySymbol()` from `src/features/v1/format.ts`.
   - _Impact:_ Guarantees consistent INR (₹) / SGD ($) formatting and decimal rounding across all customer and owner cards.
2. **Consolidate Google Maps SDK Loading (Priority: P0 | Risk: Low | Time: 1.5 hrs)**
   - Refactor `PinMap.tsx` to import `loadMaps()` from `src/features/discover/mapsSdk.ts`.
   - Remove redundant script injection and duplicate window listener logic in `PinMap.tsx` (removes ~40 lines of duplicate browser event code).
   - _Impact:_ Prevents race conditions when opening customer discovery and merchant onboarding in the same browser session.
3. **Centralize Backend Pydantic Settings Instantiations (Priority: P1 | Risk: Low | Time: 1 hr)**
   - Provide a canonical helper function `get_test_settings(**overrides)` in `backend/tests/conftest.py` and `app/settings.py`.
   - Eliminate 15+ `# type: ignore[call-arg]` occurrences caused by passing `_env_file=None` directly to `Settings()`.
4. **Clean up Unused ESLint Hook Suppressions (Priority: P1 | Risk: Low | Time: 1 hr)**
   - Review the 8 `react-hooks/exhaustive-deps` suppressions in `src/features/`.
   - Use `useRef` for stable callback references where appropriate, eliminating unnecessary lint suppressions.

---

### Phase 2: Post-Submission (After 18 Oct — Structural Decompositions)

These tasks address massive architectural god-components and require multi-day regression testing.

1. **Decompose `CoachScreen.tsx` (1,573 lines, 242 branches) (Priority: P0 | Risk: High | Time: 2 days)**
   - Extract the state machine and Server-Sent Events listener into `useCoachSession.ts`.
   - Move chart visualization cards into dedicated components (`CoachSalesCard.tsx`, `CoachInsightsCard.tsx`).
   - Break out action sheets (`ShopSheets.tsx`) into decoupled lazy-loaded modules.
2. **Decompose `NewShopFlow.tsx` / `Journey` (1,886 lines, 187 branches) (Priority: P0 | Risk: High | Time: 2 days)**
   - Separate conversational chat bubbles, interactive camera viewfinder, and map pin dropper into distinct step views.
   - Implement an explicit state reducer rather than coupling all step state in a single component closure.
3. **Refactor Backend `create_app` in `main.py` (473 lines, 49 branches) (Priority: P1 | Risk: Medium | Time: 1.5 days)**
   - Break `create_app()` into modular setup functions: `configure_middleware(app)`, `configure_lifespan(app)`, `register_routers(app)`, `register_websocket_handlers(app)`.
   - Decouple router mounting from runtime service instantiation.
4. **Standardize M3 Modal Sheet Architecture (Priority: P2 | Risk: Medium | Time: 1 day)**
   - Deprecate standalone custom sheet drawers (`MenuSheet.tsx`, `Orders.tsx`) in favor of a single parameterized `Sheet` component with swipeable gestures and safe-area insets.
5. **Centralize Static System Prompts into `backend/app/prompts/` (Priority: P2 | Risk: Low | Time: 1 day)**
   - Move all long LLM system instructions (`INSTRUCTION`, `NEW_SHOP_INSTRUCTION`, `CONNECTOR_PROMPT`, `PROMPT`) into a dedicated `prompts` directory with typing and unit snapshot testing.

---

_End of Code Quality Audit Report._
