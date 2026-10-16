# Director harness corrections

The initial recording attempt was discarded, not counted as product evidence:

- A shared node_modules junction placed font assets outside Vite's default file allowlist. The brand-font requests returned 403, so the visual recordings used fallback fonts.
- The shared Vite optimizer cache could be reused by other worktrees. The director now uses a unique cache and an explicit allowlist for the local dependency directory.
- After the first director process stopped, another worker's Python API occupied 127.0.0.1:3537. Later attempts hit connection failures or the wrong server. The harness now verifies a director-specific identity endpoint and exact backend baseline/mode before recording.
- The discovery fixture initially omitted an exact shop pin and searched the wrong city/item. The corrected adapter chooses location explicitly, seeds the known synthetic photo pin and searches an actual menu item.
- Erasure restarts the page after 1.5 seconds; a full audit of the transient receipt raced that navigation. The adapter captures the receipt promptly, then audits the stable welcome state. Opening Install closes Settings; language selection reopens it.
- The app treats the `.2` alias root as marketing; owner walks therefore use the existing explicit `?app=business` override. Bootstrap does not accept `.2` as its configured HTTP customer origin, so the share-link hand-off remains unvalidated; direct customer routes are exercised instead.

The replacement run uses **127.0.0.2:3537** for the web server and **127.0.0.1:3637** for its API, preserving the assigned port numbers without touching another worker's service. Fresh isolated databases and data/test-vectors are created for the replacement run. Screenshots now require the brand font to be loaded. These were recording-environment/setup issues; no product code was changed to resolve them.
