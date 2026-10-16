# S16 · Finish follow and moderation recovery as a short return loop

Owner area: **customer**. Dispatcher: the assistant. Priority: **P2**. Scope: one area; Track R changes no product code.

## Evidence and limits

Baseline `fa60840b0a231008e068275a62171790a36cd2e9`; partial. 4/4 variants; 12 screens; 0 axe rule occurrences; 0 overflow screens. [Phone run](../stories/director/s16/phone-light/run.json), [video](../stories/director/s16/phone-light/walk.webm), [contract](../../STORIES.md#s16--follow-community-tips-and-personal-preferences).

- Moderated tips, preference ranking, failure rollback and account persistence need further evidence.

## Smallest fix / next proof

Record follow/unfollow acknowledgement and rollback, useful empty Saved recovery, pending/rejected/approved tip and delete. Keep source/demo labels and avoid an endless generic feed.

Locate: src/features/customer/FollowButton.tsx; src/features/customer/Saved.tsx; src/features/customer/Tips.tsx. Locations without line numbers are dispatch pointers, not verified defect lines. Entry-blocked means the recorded navigation did not expose this route; it does not prove backend absence.

## Acceptance

- [ ] No exact customer location on social screens.
- [ ] Demo tips clearly labelled.
- [ ] Personalisation scope stated.
- [ ] Unfollow restores previous state on failure.
- [ ] Capture the changed route at 390×844 and 1440×1000, light/dark; verify keyboard, reduced motion and the contract's recovery states.
- [ ] Link before/after evidence; do not count a fixture as live accuracy.

## Boundary

Do not expand into other owners' areas, cloud configuration, model calls or external business writes. Dependencies go back to the assistant for dispatch.
