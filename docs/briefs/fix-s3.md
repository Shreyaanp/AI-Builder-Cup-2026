# S3 · Restore valid list semantics in the shared conversation log

Owner area: **customer**. Dispatcher: Claude. Priority: **P1**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 40 screens; 4 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s3/phone-light/run.json), [video](../stories/director/s3/phone-light/walk.webm), [contract](../../STORIES.md#s3--customer-discovers-and-talks-to-a-shop).

- Local identity stand-in and same-context owner/customer pages only. Real Google sign-in and account isolation are separate unvalidated evidence.

## Smallest fix / next proof

The owner reply checkpoint reports serious axe listitem violations. The ordered-list container has role=log, which replaces its list semantics while its children remain li. Put a real ordered list inside a named log wrapper (or another correctly announced transcript pattern) and preserve chronological reading order. Re-run both owner and customer thread checkpoints, keyboard reply and live announcements. Draft/send-retry and Back restoration remain separate acceptance checks; identity gating already works in the local fixture.

Locate: src/features/inquiries/ConversationView.tsx:47 and :135; shared customer/owner conversation area. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] Browsing and instant facts need no sign-in.
- [ ] Owner chat always needs sign-in.
- [ ] Owner-stated halal is never certified by the app.
- [ ] Back restores state.
- [ ] Light/dark keep photos in colour.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to Claude for dispatch.
