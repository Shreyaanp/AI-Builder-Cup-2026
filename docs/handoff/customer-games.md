# Customer games: handoff

Branch `feat/customer-games` (Track Q). The game layer for the customer passport: scratch cards
with published odds, welcome stamps, streak freezes, collection sets, the neighbourhood co-op
goal, social proof and shop thank-yous. Theory for each mechanic: docs/research/gamification.md.

This branch did **not** touch the front-door files owned by `feat/customer-ai-first`
(`src/features/discover/AskHome.tsx`, conversation, customer chats, frontdoors). The games are
live in the passport (`/explore/passport`), on public shop pages and in the owner's shop tiles.
Mounting them on the new front door is the remaining wiring, below.

## Entry points for the front door

Import from `src/features/passport/games` (the folder's `index.ts`):

| Export                                                 | What it is                                                                                                                                                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GamesCard`                                            | Compact card: streak flame, the next named reward, scratch cards waiting, a link to the passport. Renders nothing until the passport loads, so it never shifts the layout. Props: `place?: { lat, lng } \| null`. |
| `NextRewardLine`                                       | Just the "2 more stamps → free bun maska" ribbon. Props: `view: PassportView`.                                                                                                                                    |
| `useGames(place?)`                                     | Hook: `{ status, signedIn, refresh, passport, games, next, scratch, streak, coop, nudge }`. Kept fresh with the passport store.                                                                                   |
| `useGameActions(place?)`                               | `reveal(id)`, `freeze('this' \| 'next')`, `claimCoop(coop)`, `markPerkUsed(id)`. Every outcome comes from the server.                                                                                             |
| `ScratchCard`, `StreakFlame`, `CoopGoal`, `HowItWorks` | The individual pieces, if the front door wants one inline.                                                                                                                                                        |

### Suggested wiring (after both branches merge)

In `AskHome.tsx`, under the ask box or in the "for you" column:

```tsx
import { GamesCard, useGames } from '../passport/games'

const { nudge } = useGames(place)
// ...
<GamesCard place={place} />
```

`nudge` is true from Friday when a streak is running and the week has no stamp yet. It's a good
signal for showing the card higher up, but never as a modal.

## Backend

- `backend/app/games.py`: pure rules (odds, draw, reveal, sets, freezes, co-op, social proof).
- `backend/app/games_routes.py`:
  - `POST /api/v1/customer/games/scratch/{id}/reveal`
  - `POST /api/v1/customer/games/freeze` `{ week: "this" | "next" }`
  - `POST /api/v1/customer/games/coop/claim` `{ area, week }`
  - `POST /api/v1/customer/games/perks/{id}/use`
  - `GET /api/v1/public/shops/{id}/games` (odds, welcome stamps, thank-yous, "neighbours tried")
- Passport view gains `games` (`next_reward`, `scratch`, `sets`, `coop`, `won_perks`, `nudge`) and
  streak freezes. Owner perks get new triggers: `third_visit`, `tip`, `follow`, `scratch`,
  `set_complete`.
- Shared state (co-op tallies, "tried" counts) uses the community Documents store, so it runs the
  same on SQLite and Firestore. Account erasure removes the person from both.

## Evidence

- Story: `tests/stories/s13-games.spec.ts` (stamp → scratch → prize → set progress → co-op
  contribution → streak freeze), phone 390x844 and desktop, light and dark, axe checks.
- Screenshots: `docs/stories/games-*.png`; recording of the scratch moment:
  `docs/stories/games-scratch.webm`.
- Copy in all 15 locales: `src/features/passport/games/locales/`.
