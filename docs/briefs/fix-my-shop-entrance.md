# My shop · verify recap readability during entrance

Owner area: **my shop**. Dispatcher: Claude. Priority: **P2, reproduce first**. Scope: the Weekly recap tile's entrance/readability only.

Observed on main `fa60840`: the light phone host screens in [S14](../stories/director/s14/phone-light/01-entry-boundary.json) and [S20](../stories/director/s20/phone-light/01-entry-boundary.json) report Weekly recap label contrast of **3.05:1** and **4.39:1**. They show different blended foreground/background colours for the same label. This may be a tile entrance phase, not a persistent palette defect. The screenshot finishes finite animation, while the subsequent live DOM audit can observe a different phase; do not infer a fixed token failure from these two samples.

Locate the Weekly recap tile in `src/features/v1/ShopTiles.tsx` and its entrance styles. Reproduce the same synthetic shop at 390×844 light, sampling entry start, middle and settled state. Keep ordinary reading and keyboard focus usable; use the shared paired text/surface roles. If the settled state passes, retain the evidence and classify the earlier observation as transitional rather than changing global colours. Any animation change must preserve the quiet owner experience and reduced-motion end state.

Acceptance: record all three phases and actual computed contrast, verify final readability and focus at 200% text, and add the before/after evidence to the scorecard. No new feature or backend work belongs in this brief.
