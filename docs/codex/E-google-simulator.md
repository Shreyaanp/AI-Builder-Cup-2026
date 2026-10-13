# Task E — Labelled Google Business Profile simulator

Read `docs/codex/CONVENTIONS.md` first, then `../V1_FLOW_ACCEPTANCE_TESTS.md` section E (if not
reachable, the essentials are below), `src/features/v1/screens/GoogleScreen.tsx`,
`backend/app/merchant_routes.py`, `backend/app/merchant.py`.

## Goal

The Google tab today shows a readiness checklist and official handoff links. Add a **fully
labelled simulator** of Google's owner journey so judges can see the complete lifecycle without
real API access. Every simulator screen and result shows a persistent banner:
"Simulated — no Google listing is created or changed" (Hindi too). The existing official
handoff (business.google.com/add, Maps claim link) stays available and separate.

## Journey (one wizard inside the Google tab, M3 full-screen dialog on phones / dialog on desktop)

1. Goal: "Put my shop on Google (simulation)" — reuses the active shop's saved facts (E11).
2. Business type: customers visit / I visit customers (service area) / online only. Online-only →
   ineligible explanation, independent customer page stays useful (E10). Service area with a
   private home address: show clearly that the address will be hidden and only the area shown (E12).
3. Facts: show reused facts, ask only for missing destination fields; category must be chosen
   from a small fixture list per region (E14) — free text is not accepted as a Google category.
4. Permission: "Choose the Google account that manages this business" — a fictional account
   picker (no password/OAuth). Cancel or wrong account returns to the saved draft (E13).
5. Search: fixture results for the shop: none / one match / several / already managed by you /
   managed by someone else (E02, E03, E04). Owner chooses; no auto-claim.
6. Claim or create: create new, request ownership (pending/rejected/granted), or update managed.
7. Final review: preview of the listing fields; editing a fact changes the preview revision (E15).
   Local checks are labelled "checked locally — not validated by Google" (E16).
8. Submit: fictional receipt `SIM-…`; outcomes accepted / rejected field (E21) / unknown timeout
   (E08: shows pending, a retry first reconciles and never creates twice).
9. Verify: methods returned by the scenario (SMS, email, phone, postcard, video-required, none)
   (E06, E17). Fictional code fixture `123456`; wrong/expired code recovery (E18). Video-required
   offers a preparation checklist and the official handoff; never marks verified (E07, E19).
10. Result: separate statuses for verification and publication: verified / pending / restricted
    (E09). Never "live on Maps".
11. Return/update: later edits (e.g. hours) show "would need re-verification" when address or
    category change (E22). Inventory price changes never claim Google sync (E23).
12. Disconnect (simulated): pending removal vs confirmed removal; the merchant keeps their
    listing (E25).

Named scenarios (reviewer control only — a small "Reviewer: scenario" select hidden behind an
expander at the bottom of the Google tab, also settable via `?sim=<name>`): new-store-success,
service-area, existing-managed, claim-pending, claim-rejected, ambiguous-match, video-required,
code-expired, submit-unknown, restricted, reauthorization-required, ineligible. Reset restarts the
simulation for that shop without touching real merchant data (E24).

## Backend

- New `backend/app/google_sim.py`: pure, deterministic state machine
  (`step(state, action, scenario) -> state`) with Pydantic models; no network.
- Persist per owner+business simulation state separately from real records: add
  `sim_state(uid, bid)` / `save_sim_state(uid, bid, state)` to the repository protocol and both
  stores (SQLite table / Firestore doc under the business). Erasing the owner removes it.
- Router `/api/v1/businesses/{id}/google-sim` (GET state, POST action, POST reset), consented
  owner only, 404 for other owners.

## Tests

- Backend: unit tests of the state machine for every scenario path and E-ID above; store tests on
  both adapters; route tests for ownership and reset isolation.
- Playwright `tests/google-sim.spec.ts`: happy path (new-store-success) to "verified (simulated)",
  claim-rejected path, code-expired recovery, submit-unknown no-duplicate retry, the simulated
  banner visible on every step, and axe (wcag2a/2aa/21aa) zero violations on two wizard steps.
