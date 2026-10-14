/** SSE snapshot reader: headers carry credentials; heartbeats keep the watchdog alive. */
export async function followInquiries(
  connect: (init: RequestInit) => Promise<Response>,
  signal: AbortSignal,
  onSnapshot: (value: unknown) => void,
) {
  let lastId = ''
  for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
    const connection = new AbortController()
    const combined = AbortSignal.any([signal, connection.signal])
    let lastBytes = Date.now()
    const watchdog = setInterval(() => {
      if (Date.now() - lastBytes > 45_000) connection.abort()
    }, 5_000)
    try {
      const response = await connect({
        signal: combined,
        headers: lastId ? { 'Last-Event-ID': lastId } : {},
      })
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get('content-type')?.includes('text/event-stream')
      )
        throw new Error('Stream unavailable')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (!combined.aborted) {
          const result = await reader.read()
          if (result.done) throw new Error('Stream ended')
          lastBytes = Date.now()
          buffer += decoder.decode(result.value, { stream: true })
          buffer = buffer.replace(/\r\n/g, '\n')
          // A thread is bounded to 400 messages, including Unicode text.
          if (buffer.length > 2_000_000) throw new Error('Stream too large')
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
            const id = lines
              .find((line) => line.startsWith('id:'))
              ?.slice(3)
              .trim()
            if (id && id === lastId) continue
            onSnapshot(JSON.parse(data))
            if (id) lastId = id
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    } catch (error) {
      if (signal.aborted) return
      if (attempt === 2) throw error
    } finally {
      clearInterval(watchdog)
    }
  }
}
