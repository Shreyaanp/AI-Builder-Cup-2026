import type { components } from '../../api/generated'

export type AskAnswer = components['schemas']['AskResponse']
export type AskIntent = components['schemas']['Intent']
export type AskPick = components['schemas']['Pick']
export type Refine = NonNullable<components['schemas']['AskRequest']['refine']>
export type Suggestions = components['schemas']['AskSuggestions']

/** One exchange: what the customer said and how the assistant answered it. */
export type Turn = {
  id: string
  /** What the customer typed, said or tapped. 'today' asks for Today's 7. */
  kind: 'ask' | 'today'
  q: string
  refine?: Refine | null
  /** The previous answer's intent this message continues (follow-ups keep context). */
  context?: AskIntent | null
  status: 'thinking' | 'done' | 'failed' | 'offline' | 'stopped'
  answer?: AskAnswer
  place: { lat: number; lng: number; label: string }
}

const KEY = 'chalkboard.ask.conversation.v1'
const MAX_TURNS = 12

/** The open conversation survives visiting a shop or a chat (this tab only). */
export function loadTurns(): Turn[] {
  try {
    const turns = JSON.parse(sessionStorage.getItem(KEY) || '[]') as Turn[]
    if (!Array.isArray(turns)) return []
    // A request cut off by leaving the page is offered again, never left spinning.
    return turns.map((turn) =>
      turn.status === 'thinking' ? { ...turn, status: 'stopped' as const } : turn,
    )
  } catch {
    return []
  }
}

export function saveTurns(turns: Turn[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-MAX_TURNS)))
  } catch {
    /* Optional storage: the conversation still works for this visit. */
  }
}

export function clearTurns() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* Optional storage. */
  }
}

/** The intent a new message continues: the latest answered search, if any. */
export function lastIntent(turns: Turn[]): AskIntent | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!
    if (turn.kind === 'ask' && turn.status === 'done' && turn.answer) return turn.answer.intent
  }
  return null
}

export function turnId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
