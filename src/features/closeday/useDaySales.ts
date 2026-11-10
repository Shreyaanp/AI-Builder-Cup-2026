import { useEffect, useState } from 'react'
import { useWorkspace } from '../v1/workspaceContext'

export type SavedSale = {
  date: string
  item: string
  quantity: number
  revenue: number | null
  /** A day closed with one total: money only, no item (day_total.py). */
  whole_day?: boolean
  cash?: number | null
  upi?: number | null
}

/** Sent when a day is closed or edited, so every screen showing today's sales looks again. */
export const DAY_CLOSED = 'chalkboard:day-closed'

/** Check saved records before allowing a new close; a failed check must not look empty. */
export function useDaySales(day: string) {
  const { api, active } = useWorkspace()
  const id = active?.id
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    id: string
    day: string
    rows: SavedSale[] | null
    failed: boolean
  } | null>(null)
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    void api<SavedSale[]>(`/businesses/${encodeURIComponent(id)}/sales`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
    })
      .then((rows) => {
        if (!controller.signal.aborted)
          setResult({ id, day, rows: rows.filter((row) => row.date === day), failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ id, day, rows: null, failed: true })
      })
    return () => controller.abort()
  }, [api, id, day, attempt])
  // Closed from another screen (Coach, the chat's button): the Grow card never goes stale.
  useEffect(() => {
    const again = () => setAttempt((n) => n + 1)
    window.addEventListener(DAY_CLOSED, again)
    return () => window.removeEventListener(DAY_CLOSED, again)
  }, [])
  const current = result && result.id === id && result.day === day ? result : null
  return {
    rows: current?.rows ?? null,
    failed: current?.failed ?? false,
    /** Look again without blanking what is shown (after the sheet closes). */
    refresh: () => setAttempt((n) => n + 1),
    retry: () => {
      setResult(null)
      setAttempt((n) => n + 1)
    },
  }
}
