import { useState } from 'react'
import type { CoachAction } from './coachAction'

// OB-249: the chat's card rules, shared by CoachScreen and the cards.

export type ReplyState = 'ready' | 'sent' | 'dismissed' | 'failed'

/** Optimistic: Sent shows at once and rolls back if sending fails. */
export async function sendPrepared(
  action: CoachAction,
  onSend: (action: CoachAction) => Promise<boolean>,
  setState: (state: ReplyState) => void,
) {
  setState('sent')
  if (!(await onSend(action))) setState('failed')
}

/**
 * Which chat card is open: the newest one, until the owner opens another (one at a time). A new
 * card arriving opens itself and folds the rest again.
 */
export function useCardFold(keys: string[]) {
  const newest = keys.at(-1) ?? null
  const [chosen, setChosen] = useState<{ key: string; newest: string | null } | null>(null)
  const open = chosen && chosen.newest === newest ? chosen.key : newest
  return {
    open: (key: string) => key === open,
    newest: (key: string) => key === newest,
    // Folding the card the owner opened gives the newest one back.
    toggle: (key: string) => setChosen(key === open ? null : { key, newest }),
  }
}
