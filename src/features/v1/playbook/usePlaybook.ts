import { useCallback, useEffect, useState } from 'react'
import type { components } from '../../../api/generated'
import { useLocale } from '../../../state/hooks'
import { useWorkspace } from '../workspaceContext'

export type PlaybookView = components['schemas']['PlaybookView']
export type TodayHints = components['schemas']['TodayHints']

type State =
  { kind: 'loading' } | { kind: 'ready'; view: PlaybookView } | { kind: 'failed'; status: number }

/**
 * The active shop's playbook. The server builds it only when it is missing or out of date (at
 * most one model call), so reading it is cheap. Today and Grow use `view.today` and `view.grow`
 * to order what they already show; this hook is the one place that fetches it.
 */
export function usePlaybook(enabled = true) {
  const { api, activeId } = useWorkspace()
  const language = useLocale()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const path = activeId
    ? `/businesses/${encodeURIComponent(activeId)}/playbook?language=${encodeURIComponent(language)}`
    : null

  useEffect(() => {
    if (!enabled || !path) return
    const abort = new AbortController()
    void api<PlaybookView>(path, { signal: abort.signal })
      .then((view) => {
        if (!abort.signal.aborted) setState({ kind: 'ready', view })
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setState({ kind: 'failed', status: (error as { status?: number }).status ?? 0 })
      })
    return () => abort.abort()
  }, [api, path, enabled, attempt])

  const retry = useCallback(() => {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { state, setState, retry, path, activeId }
}
