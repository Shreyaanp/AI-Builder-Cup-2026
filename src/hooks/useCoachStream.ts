import { useEffect, useRef, useState } from 'react'
import { streamCoach, TURN_IDLE_MS } from '../api/stream'
import { useIdentity } from '../auth/useIdentity'
import { listConversations, restoreConversation } from '../api/conversations'
import type { ConversationSummary } from '../api/conversations'

export function useCoachStream() {
  const identity = useIdentity()
  const { mode: identityMode, status: identityStatus, scope: identityScope, getToken } = identity
  const [reply, setReply] = useState('')
  const [status, setStatus] = useState<'idle' | 'streaming' | 'complete' | 'cancelled' | 'error'>(
    'idle',
  )
  const [mode, setMode] = useState<'offline' | 'gemini'>('offline')
  const [error, setError] = useState('')
  const [history, setHistory] = useState<ConversationSummary[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const restoreRef = useRef<AbortController | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<string | null>(null)
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      restoreRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (identityMode !== 'firebase' || identityStatus !== 'ready') return
    const controller = new AbortController()
    void getToken()
      .then((token) => listConversations(token, controller.signal))
      .then((items) => {
        if (!controller.signal.aborted) setHistory(items)
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Your conversation list is unavailable. You can start a new one.')
      })
    return () => controller.abort()
  }, [identityMode, identityStatus, identityScope, getToken])

  async function send(message: string, language: 'en' | 'hi'): Promise<boolean> {
    if (controllerRef.current || restoreRef.current) return false
    const controller = new AbortController()
    controllerRef.current = controller
    setReply('')
    setError('')
    setStatus('streaming')
    const current = () => mountedRef.current && controllerRef.current === controller
    try {
      const token = await identity.getToken()
      if (!current() || controller.signal.aborted) return false
      await streamCoach(
        { message, language, session_id: sessionRef.current },
        controller.signal,
        (event) => {
          if (!current()) return
          if (event.kind === 'ready') {
            sessionRef.current = event.session_id ?? null
            setSessionId(sessionRef.current)
            if (event.mode) setMode(event.mode)
          }
          if (event.kind === 'delta') setReply((text) => text + (event.text ?? ''))
          if (event.kind === 'reply') setReply(event.text ?? '')
        },
        token,
        undefined,
        // Streaming never stays on: no event for this long ends the turn with an error.
        TURN_IDLE_MS,
      )
      if (!current()) return false
      setStatus('complete')
      if (identity.mode === 'firebase' && sessionRef.current) {
        const id = sessionRef.current
        setHistory((items) =>
          [
            { session_id: id, updated: Date.now() / 1000 },
            ...items.filter((item) => item.session_id !== id),
          ].slice(0, 20),
        )
      }
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
    if (!controllerRef.current) return
    controllerRef.current?.abort()
    controllerRef.current = null
    setStatus('cancelled')
  }

  async function selectSession(id: string | null) {
    if (controllerRef.current) return
    restoreRef.current?.abort()
    restoreRef.current = null
    setError('')
    if (!id) {
      sessionRef.current = null
      setSessionId(null)
      setReply('')
      setStatus('idle')
      setRestoring(false)
      return
    }
    const controller = new AbortController()
    restoreRef.current = controller
    setRestoring(true)
    try {
      const token = await identity.getToken()
      const restored = await restoreConversation(id, token, controller.signal)
      if (!mountedRef.current || restoreRef.current !== controller) return
      sessionRef.current = id
      setSessionId(id)
      setReply(restored)
      setStatus('idle')
    } catch {
      if (mountedRef.current && !controller.signal.aborted)
        setError('Could not restore that conversation. Please try again.')
    } finally {
      if (restoreRef.current === controller) {
        restoreRef.current = null
        if (mountedRef.current) setRestoring(false)
      }
    }
  }

  return {
    reply,
    status,
    mode,
    error,
    send,
    stop,
    history,
    sessionId,
    selectSession,
    restoring,
    busy: restoring || status === 'streaming',
  }
}
