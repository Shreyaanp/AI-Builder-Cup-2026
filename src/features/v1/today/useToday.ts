import { useEffect, useState } from 'react'
import { useWorkspace } from '../workspaceContext'
import type { TodayFacts } from './todayPlan'

const REFRESH_MS = 5 * 60_000

/**
 * Server facts for the Today view (pulse, forecast, low stock, coach line). Reloads when the
 * shop changes (a saved edit, a sold-out switch, a confirmed menu) and every few minutes.
 * Null while loading or when the facts are unavailable: Today then shows what the app knows.
 */
export function useToday(): TodayFacts | null {
  const { api, active, products } = useWorkspace()
  const [facts, setFacts] = useState<{ id: string; value: TodayFacts } | null>(null)
  const id = active?.id
  const revision = active?.revision
  const confirmed = active?.last_confirmed
  const stock = products.map((p) => `${p.stock}:${p.available}`).join()
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const load = () =>
      void api<TodayFacts>(`/businesses/${encodeURIComponent(id)}/today`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
      })
        .then((value) => {
          if (!controller.signal.aborted) setFacts({ id, value })
        })
        .catch(() => undefined)
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [api, id, revision, confirmed, stock])
  return facts && facts.id === id ? facts.value : null
}
