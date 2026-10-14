import { followInquiries } from '../../api/inquiryStream'
import { useCallback, useEffect, useState } from 'react'
import type { components } from '../../api/generated'
import { useWorkspace } from './workspaceContext'

type Inquiry = components['schemas']['Inquiry']

/** Count of customer messages not yet marked done for the active shop (null while unknown). */
export function useUnread(): { unread: number | null; refresh: () => void } {
  const { api, activeId } = useWorkspace()
  const [unread, setUnread] = useState<number | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!activeId) return
    const abort = new AbortController()
    const path = `/businesses/${encodeURIComponent(activeId)}/inquiries`
    const load = () =>
      api<Inquiry[]>(path, {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25_000)]),
      })
        .then((items) => {
          if (!abort.signal.aborted)
            setUnread(items.filter((item) => item.unread && !item.done).length)
        })
        .catch(() => undefined)
    let timer: ReturnType<typeof setInterval> | undefined
    void load()
    void followInquiries(
      (init) => api<Response>(`${path}/stream`, { ...init, raw: true }),
      abort.signal,
      () => {
        void load()
      },
    ).catch(() => {
      if (abort.signal.aborted) return
      void load()
      timer = setInterval(() => {
        void load()
      }, 15_000)
    })
    return () => {
      abort.abort()
      clearInterval(timer)
    }
  }, [api, activeId, version])
  const refresh = useCallback(() => setVersion((value) => value + 1), [])
  return { unread: activeId ? unread : null, refresh }
}
