import type { components } from './generated.js'

export type CoachEvent = components['schemas']['StreamEvent']
type CoachTurn = components['schemas']['CoachTurn']
const kinds = new Set<CoachEvent['kind']>([
  'ready',
  'delta',
  'reply',
  'turn_complete',
  'error',
  'interrupted',
  'input_transcript',
  'output_transcript',
  'audio_format',
  'pong',
  'proposal',
  'workflow',
])

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

export async function streamCoach(
  turn: CoachTurn,
  signal: AbortSignal,
  onEvent: (event: CoachEvent) => void,
  token: string | null = null,
): Promise<void> {
  signal = AbortSignal.any([signal, AbortSignal.timeout(45_000)])
  const bootstrap = await fetch('/api/v1/bootstrap', { credentials: 'same-origin', signal })
  if (!bootstrap.ok) throw new Error('Could not establish a local coach session.')
  const response = await fetch('/api/v1/coach/stream', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(turn),
  })
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'The coach is busy. Please try again shortly.'
        : 'The coach could not start. Your note is still here.',
    )
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('The coach did not return a stream.')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let complete = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Normalize only complete CRLF pairs; a CR can arrive in a separate chunk.
      buffer = buffer.replace(/\r\n/g, '\n')
      if (buffer.length > 65_536) throw new Error('The coach response exceeded the limit.')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (!data) continue
        const event = decodeEvent(data)
        if (event.kind === 'error') throw new Error('The coach stopped. Your note is still here.')
        onEvent(event)
        if (event.kind === 'turn_complete') complete = true
      }
    }
    if (!complete) throw new Error('The connection ended early. Your note is still here.')
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
