import { useEffect, useRef, useState } from 'react'
import { streamCoach } from '../api/stream'

export function useCoachStream() {
  const [reply, setReply] = useState('')
  const [status, setStatus] = useState<'idle' | 'streaming' | 'complete' | 'cancelled' | 'error'>(
    'idle',
  )
  const [mode, setMode] = useState<'offline' | 'gemini'>('offline')
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<string | null>(null)
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  async function send(message: string, language: 'en' | 'hi'): Promise<boolean> {
    if (controllerRef.current) return false
    const controller = new AbortController()
    controllerRef.current = controller
    setReply('')
    setError('')
    setStatus('streaming')
    const current = () => mountedRef.current && controllerRef.current === controller
    try {
      await streamCoach(
        { message, language, session_id: sessionRef.current },
        controller.signal,
        (event) => {
          if (!current()) return
          if (event.kind === 'ready') {
            sessionRef.current = event.session_id ?? null
            if (event.mode) setMode(event.mode)
          }
          if (event.kind === 'delta') setReply((text) => text + (event.text ?? ''))
          if (event.kind === 'reply') setReply(event.text ?? '')
        },
      )
      if (!current()) return false
      setStatus('complete')
      return true
    } catch (cause) {
      if (current()) {
        setStatus(controller.signal.aborted ? 'cancelled' : 'error')
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'The coach is unavailable.')
        }
      }
      return false
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  function stop() {
    controllerRef.current?.abort()
    controllerRef.current = null
    setStatus('cancelled')
  }

  return { reply, status, mode, error, send, stop }
}
