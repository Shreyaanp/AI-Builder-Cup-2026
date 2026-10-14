import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '../v1/workspaceContext'
import type { Order } from './types'

const POLL_MS = 2000

/** Orders that reached a supplier, newest first; refreshes while `live`. */
export function useOrders(live: boolean) {
  const { api, activeId } = useWorkspace()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const refresh = useCallback(async () => {
    if (!activeId) return
    try {
      const items = await api<Order[]>(`/businesses/${encodeURIComponent(activeId)}/orders`)
      setOrders(items)
    } catch {
      // Keep the last list; the tile shows it until the next refresh.
    }
  }, [api, activeId])
  useEffect(() => {
    // Fetches are async: the list arrives after this effect, never synchronously inside it.
    const first = window.setTimeout(() => void refresh(), 0)
    if (!live) return () => window.clearTimeout(first)
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [refresh, live])
  return { orders, refresh }
}

export function deliveryLabel(order: Order, locale: string): string {
  const when = new Date(order.delivery_at)
  if (Number.isNaN(when.getTime())) return order.delivery
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(when)
}
