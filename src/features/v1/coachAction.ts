/** An app action the coach prepared by voice or text: open a screen, or a reply to send. */
export type CoachAction = {
  target:
    | 'messages'
    | 'share'
    | 'sold_out'
    | 'menu'
    | 'details'
    | 'stamps'
    | 'plan'
    | 'close_day'
    | 'google'
    | 'privacy'
    | 'import'
    | 'photo'
    | 'reply'
    | 'today'
    | 'shop'
    | 'grow'
    | 'you'
    | 'trust'
    | 'games'
  label: string
  business_id?: string | null
  thread_id?: string
  question?: string
  text?: string
}

const TARGETS = new Set<CoachAction['target']>([
  'messages',
  'share',
  'sold_out',
  'menu',
  'details',
  'stamps',
  'plan',
  'close_day',
  'google',
  'privacy',
  'import',
  'photo',
  'reply',
  'today',
  'shop',
  'grow',
  'you',
  'trust',
  'games',
])

/** Only known targets are acted on; anything else from the server is ignored. */
export function asCoachAction(data: unknown): CoachAction | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  if (typeof value.target !== 'string' || typeof value.label !== 'string') return null
  if (!TARGETS.has(value.target as CoachAction['target'])) return null
  if (
    value.target === 'reply' &&
    (typeof value.thread_id !== 'string' || typeof value.text !== 'string')
  )
    return null
  return value as unknown as CoachAction
}

/** Targets that need the owner's own tap (file pickers only open from a user gesture, and a
 * reply is only sent when the owner taps Send). The rest open by voice at once. */
export const NEEDS_TAP = new Set<CoachAction['target']>(['photo', 'import', 'reply'])
