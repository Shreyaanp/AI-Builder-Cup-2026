export interface ConversationSummary {
  session_id: string
  updated: number
}

async function ownedJson(
  path: string,
  token: string | null,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, {
    signal,
    credentials: 'same-origin',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error('Could not load your conversations. Please try again.')
  return response.json()
}

export async function listConversations(
  token: string | null,
  signal: AbortSignal,
): Promise<ConversationSummary[]> {
  const data = await ownedJson('/api/v1/conversations', token, signal)
  if (!Array.isArray(data) || data.length > 20) throw new Error('Invalid conversation list.')
  return data.map((value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('session_id' in value) ||
      !('updated' in value) ||
      typeof value.session_id !== 'string' ||
      typeof value.updated !== 'number'
    )
      throw new Error('Invalid conversation list.')
    return { session_id: value.session_id, updated: value.updated }
  })
}

export async function restoreConversation(
  id: string,
  token: string | null,
  signal: AbortSignal,
): Promise<string> {
  const data = await ownedJson(
    `/api/v1/conversations/${encodeURIComponent(id)}`,
    token,
    AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  )
  if (!data || typeof data !== 'object' || !('messages' in data) || !Array.isArray(data.messages))
    throw new Error('Invalid conversation.')
  for (const message of [...data.messages].reverse()) {
    if (
      message &&
      typeof message === 'object' &&
      'role' in message &&
      message.role === 'assistant' &&
      'text' in message &&
      typeof message.text === 'string'
    )
      return message.text
  }
  return ''
}
