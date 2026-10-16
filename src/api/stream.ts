import type { components } from './generated.js'
import { clientTimezoneHeader } from './timezone.js'

export type CoachEvent = components['schemas']['StreamEvent']
type CoachTurn = components['schemas']['CoachTurn']
// Every event kind the server may send. A Record (not a list) so TypeScript fails the build when the
// contract gains a kind this client does not know (a missing kind dropped the whole reply).
const KNOWN: Record<CoachEvent['kind'], true> = {
  ready: true,
  delta: true,
  reply: true,
  turn_complete: true,
  error: true,
  interrupted: true,
  input_transcript: true,
  output_transcript: true,
  audio_format: true,
  pong: true,
  ping: true,
  proposal: true,
  workflow: true,
  sourcing: true,
  suppliers: true,
  order: true,
  rescue_proposal: true,
  chart: true,
  payment_link: true,
}
const kinds = new Set(Object.keys(KNOWN))

function decodeEvent(data: string): CoachEvent {
  const value: unknown = JSON.parse(data)
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    typeof value.kind !== 'string' ||
    !kinds.has(value.kind as CoachEvent['kind'])
  ) {
    throw new Error('Invalid response from the coach.')
  }
  const record = value as Record<string, unknown>
  for (const field of ['text', 'code', 'session_id']) {
    if (record[field] != null && typeof record[field] !== 'string') {
      throw new Error('Invalid response from the coach.')
    }
  }
  if (record.mode != null && record.mode !== 'offline' && record.mode !== 'gemini') {
    throw new Error('Invalid response from the coach.')
  }
  return value as CoachEvent
}

class StreamFailure extends Error {}

export class RateLimitError extends StreamFailure {}

export function reconnectDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const abort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function waitOnline(signal: AbortSignal): Promise<void> {
  if (navigator.onLine) return
  await new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const cleanup = () => {
      window.removeEventListener('online', online)
      signal.removeEventListener('abort', abort)
    }
    const online = () => {
      cleanup()
      resolve()
    }
    const abort = () => {
      cleanup()
      reject(signal.reason)
    }
    window.addEventListener('online', online, { once: true })
    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function streamCoach(
  turn: CoachTurn,
  signal: AbortSignal,
  onEvent: (event: CoachEvent) => void,
  token: string | null | (() => Promise<string | null>) = null,
  onConnection: (state: 'connected' | 'reconnecting') => void = () => {},
): Promise<void> {
  // Overall recovery is bounded; each silent connection has its own watchdog.
  signal = AbortSignal.any([signal, AbortSignal.timeout(175_000)])
  const bootstrap = await fetch('/api/v1/bootstrap', { credentials: 'same-origin', signal })
  if (bootstrap.status === 429) throw new RateLimitError('RATE_LIMITED')
  if (!bootstrap.ok) throw new Error('Could not establish a local coach session.')
  let lastId = ''
  let sessionId = turn.session_id
  for (let attempt = 0; ; attempt++) {
    if (attempt) {
      onConnection('reconnecting')
      await waitOnline(signal)
      await reconnectDelay(500 * 2 ** (attempt - 1), signal)
    }
    const connection = new AbortController()
    const connectionSignal = AbortSignal.any([signal, connection.signal])
    let lastBytes = Date.now()
    const watchdog = setInterval(() => {
      if (Date.now() - lastBytes > 35_000) connection.abort()
    }, 5_000)
    const offline = () => connection.abort()
    const foreground = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastBytes > 35_000)
        connection.abort()
    }
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', foreground)
    try {
      const credential = typeof token === 'function' ? await token() : token
      const response = await fetch('/api/v1/coach/stream', {
        method: 'POST',
        credentials: 'same-origin',
        signal: connectionSignal,
        headers: {
          'Content-Type': 'application/json',
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
          ...(lastId ? { 'Last-Event-ID': lastId } : {}),
          ...clientTimezoneHeader(),
        },
        body: JSON.stringify({ ...turn, session_id: sessionId }),
      })
      if (!response.ok) {
        if (response.status === 429) throw new RateLimitError('RATE_LIMITED')
        if (response.status >= 500) throw new Error('Coach connection unavailable.')
        throw new StreamFailure('The reply did not finish. Your note is still here.')
      }
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
        throw new StreamFailure('The coach did not return a stream.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          lastBytes = Date.now()
          buffer += decoder.decode(value, { stream: true })
          buffer = buffer.replace(/\r\n/g, '\n')
          if (buffer.length > 65_536)
            throw new StreamFailure('The coach response exceeded the limit.')
          let boundary: number
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const lines = frame.split('\n')
            const data = lines
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart())
              .join('\n')
            if (!data) continue
            const event = decodeEvent(data)
            const id = lines
              .find((line) => line.startsWith('id:'))
              ?.slice(3)
              .trim()
            // The replay cursor advances only after the UI consumes the entire event.
            if (id && id === lastId) continue
            if (event.kind === 'error')
              throw new StreamFailure('The coach stopped. Your note is still here.')
            if (event.kind === 'ready') sessionId = event.session_id
            onEvent(event)
            if (id) lastId = id
            onConnection('connected')
            if (event.kind === 'turn_complete') return
          }
        }
        throw new Error('The connection ended early. Your note is still here.')
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    } catch (error) {
      if (signal.aborted || error instanceof StreamFailure || !lastId || !sessionId || attempt >= 4)
        throw error
    } finally {
      clearInterval(watchdog)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', foreground)
    }
  }
}
