# React implementation rulebook

Published authorities, not an invented third-party skill:

- [React's rules](https://react.dev/reference/rules): pure render/reducers, immutable state, React controls when components and hooks run.
- [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks): call hooks only at component/custom-hook top level.
- [Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context): domain reducers with separate read/dispatch contexts and typed access hooks.
- [Effects](https://react.dev/learn/you-might-not-need-an-effect): derive values directly; use effects for external synchronization and resource lifetimes.
- [useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore): browser connectivity is an external subscription with cleanup.
- [StrictMode](https://react.dev/reference/react/StrictMode): keep development checks enabled; effects must survive setup/cleanup repetition.
- [React's ESLint plugin](https://react.dev/reference/eslint-plugin-react-hooks): executable hook/dependency and React correctness checks. `eslint.config.js` applies its recommended rules.
- [Official Vite React/TS starter](https://vite.dev/guide/): the initial template, TypeScript and development/build workflow.

## Current application choices

`AppProviders` composes preference, business and MUI theme providers. State/dispatch contexts are separate and custom hooks fail clearly outside their provider. Local inputs/dialogs/photo previews are not global state. The pure business reducer invalidates review on edits and rejects stale review revisions. Memoization is used for theme generation, not sprinkled onto every component.

Only theme/language are in preference storage. Drafts, notes, photos and account credentials are not persisted there. Photo object URLs are revoked on replacement/removal/unmount. Offline listeners clean up. Backend server state, authentication and account roles must be integrated separately rather than represented as trusted browser state.

## Contributor checks

`npm run lint`, `npm run build`, `npm run test:hooks`, `npm run test:ui`; or `npm run check`. The hook-enforcement probe supplies deliberately invalid conditional hooks and missing dependencies and confirms they are rejected; a valid effect is accepted.

Automated checks cannot establish perfect React usage, accessible UX or production readiness. Browser scenarios and review findings are recorded independently.
