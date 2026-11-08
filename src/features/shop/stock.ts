import { useEffect, useState } from 'react'
import type { Product } from '../v1/api'
import { useWorkspace } from '../v1/workspaceContext'

/** On the customer menu; false for "Things I buy" (tea dust, milk), which customers never see. */
export const onMenu = (product: Product) => product.for_sale !== false

export interface UsualSales {
  weekday: number
  items: Record<string, number>
}

/** What usually sells on today's weekday, by item (saved sales only, no model call; OB-310). */
export function useUsualSales(open: boolean): UsualSales | null {
  const { api, active } = useWorkspace()
  const id = active?.id
  const [usual, setUsual] = useState<{ id: string; value: UsualSales } | null>(null)
  useEffect(() => {
    if (!open || !id) return
    const abort = new AbortController()
    void api<UsualSales>(`/businesses/${encodeURIComponent(id)}/usual-sales`, {
      signal: abort.signal,
    })
      .then((value) => {
        if (!abort.signal.aborted) setUsual({ id, value })
      })
      // Without it the menu still shows every count, just no "low" mark.
      .catch(() => undefined)
    return () => abort.abort()
  }, [api, id, open])
  return usual && usual.id === id ? usual.value : null
}
