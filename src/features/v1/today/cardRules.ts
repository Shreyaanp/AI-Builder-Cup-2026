import { cardKind, type TodayCards } from './cardChoices'

/** Today shows at most five cards: three first, two behind "N more" (OB-176). */
export const MAX_CARDS = 5

/**
 * Cards that matter today whatever the owner chose about suggestions: people waiting, last
 * night's own promise, closing the day, stock running out and a supplier's answer. The rest
 * (the daily menu check, setup steps, customer questions to answer, items with no price) are
 * suggestions: "Only important" leaves them out.
 */
const IMPORTANT = new Set([
  'reply',
  'promise',
  'closeDay',
  'supply',
  'low',
  'soldOut',
  'supplierReply',
])

/** A waiting customer is a person, not a suggestion: never hidden, never dismissed. */
export function canDismiss(kind: string): boolean {
  return kind !== 'reply'
}

/** The cards the owner still wants to see, by their choices (null: none made yet). */
export function chosenCards<T extends { id: string; kind: string }>(
  needs: T[],
  cards: TodayCards | null | undefined,
): T[] {
  if (!cards) return needs
  return needs.filter((need) => {
    if (!canDismiss(need.kind)) return true
    if (cards.frequency === 'off') return false
    if (cards.frequency === 'important' && !IMPORTANT.has(need.kind)) return false
    return !cards.hidden.includes(need.id) && !cards.resting.includes(cardKind(need.id))
  })
}
