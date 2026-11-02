/** What counting needs of the workspace; the app's Workspace satisfies it. */
export interface Workspace {
  active: { id: string; fields: object } | null
  demo: boolean
  readOnlyMessage?: string
  me: { consent_current?: boolean }
  api: (
    path: string,
    init: { method: string; body: string; keepalive: boolean },
  ) => Promise<unknown>
}

/**
 * The owner's daily visit counts (HABIT section 9): Today opened, which prompts it showed, which
 * the owner acted on, and whether the day was closed. Counts only, first-party, for the owner's
 * own shop; the server keeps them under a pseudonymous shop key. Never in the demo, never before
 * the owner has accepted the current terms, and never awaited: a lost count never blocks a tap.
 */
export type HabitEvent = 'opened' | 'prompt_shown' | 'action_done' | 'closed'
interface Counted {
  event: HabitEvent
  kind?: string
  seconds?: number
}

const FLUSH_MS = 1500
const MAX_BATCH = 20
// The server refuses longer waits: the app was left open, not a first action.
const MAX_SECONDS = 3600

let queue: { path: string; ws: Workspace; events: Counted[] } | null = null
let timer: ReturnType<typeof setTimeout> | null = null
// Once per page load: what was already counted today (shop, day, event, kind).
const seen = new Set<string>()
let acted = false

function canCount(ws: Workspace): boolean {
  const shop = ws.active
  return Boolean(
    shop &&
    !ws.demo &&
    !ws.readOnlyMessage &&
    ws.me.consent_current &&
    !(shop.fields as { demo?: boolean }).demo,
  )
}

function flush() {
  if (timer) clearTimeout(timer)
  timer = null
  const batch = queue
  queue = null
  if (!batch?.events.length) return
  void batch.ws
    .api(batch.path, {
      method: 'POST',
      body: JSON.stringify({ events: batch.events.slice(0, MAX_BATCH) }),
      keepalive: true,
    })
    .catch(() => undefined)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  // A reload or a link away may not hide the page first; the batch still leaves (keepalive).
  window.addEventListener('pagehide', flush)
}

function add(ws: Workspace, item: Counted) {
  if (!canCount(ws)) return
  const path = `/businesses/${encodeURIComponent(ws.active!.id)}/habit`
  if (queue && queue.path !== path) flush()
  queue ??= { path, ws, events: [] }
  queue.events.push(item)
  if (queue.events.length >= MAX_BATCH) flush()
  else if (!timer) timer = setTimeout(flush, FLUSH_MS)
}

function once(ws: Workspace, key: string): boolean {
  const id = `${ws.active?.id ?? ''}:${new Date().toDateString()}:${key}`
  if (seen.has(id)) return false
  seen.add(id)
  return true
}

/** Today opened with these prompts showing; each is counted once a day per visit. */
export function countShown(ws: Workspace, kinds: string[]) {
  if (once(ws, 'opened')) add(ws, { event: 'opened' })
  for (const kind of new Set(kinds))
    if (once(ws, `shown:${kind}`)) add(ws, { event: 'prompt_shown', kind })
}

/** The owner tapped a prompt's action; the first one of the visit carries how long it took. */
export function countAction(ws: Workspace, kind: string) {
  const seconds = Math.round(performance.now() / 1000)
  add(ws, {
    event: 'action_done',
    kind,
    ...(!acted && seconds <= MAX_SECONDS ? { seconds } : {}),
  })
  acted = true
}

/** The day was saved. */
export function countClosed(ws: Workspace) {
  add(ws, { event: 'closed' })
  flush()
}
