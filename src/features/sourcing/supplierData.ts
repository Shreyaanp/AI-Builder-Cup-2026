import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useWorkspace } from '../v1/workspaceContext'
import { supplyChanged } from '../supply/supplyEvents'
import { useSupplierCopy } from './supplierCopy'

export interface SupplierProduct {
  name: string
  price: number
  unit: string
  available: boolean
  compare: { price: number; unit: string }
}

export interface SupplierDetail {
  id: string
  name: string
  demo: boolean
  currency: string
  distance_km: number | null
  delivery: string
  min_order: string
  products: SupplierProduct[]
  saved: boolean
}

// Saved marks that changed since a card was drawn, by tap or by chat, so an older card in the
// conversation and the sheet over it never disagree with My suppliers.
const marks = new Map<string, boolean>()
const listeners = new Set<() => void>()

export function markSaved(id: string, saved: boolean) {
  marks.set(id, saved)
  listeners.forEach((listener) => listener())
  supplyChanged()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSaved(id: string, drawn: boolean) {
  return useSyncExternalStore(subscribe, () => marks.get(id) ?? drawn)
}

export function useSaveSupplier() {
  const { api, activeId, notify } = useWorkspace()
  const s = useSupplierCopy()
  return useCallback(
    async (supplier: { id: string; name: string }, saved: boolean) => {
      try {
        await api(
          `/businesses/${encodeURIComponent(activeId ?? '')}/supply/suppliers/${encodeURIComponent(supplier.id)}/save`,
          { method: saved ? 'POST' : 'DELETE' },
        )
        markSaved(supplier.id, saved)
        notify(saved ? s.isSaved(supplier.name) : s.isRemoved(supplier.name))
        return true
      } catch {
        notify(s.failed)
        return false
      }
    },
    [api, activeId, notify, s],
  )
}

export function useSupplierDetail(id: string | null) {
  const { api, activeId } = useWorkspace()
  const [state, setState] = useState<{
    id: string
    detail: SupplierDetail | null
    failed: boolean
  } | null>(null)
  useEffect(() => {
    if (!id) return
    let live = true
    api<SupplierDetail>(
      `/businesses/${encodeURIComponent(activeId ?? '')}/supply/suppliers/${encodeURIComponent(id)}`,
    )
      .then((detail) => live && setState({ id, detail, failed: false }))
      .catch(() => live && setState({ id, detail: null, failed: true }))
    return () => {
      live = false
    }
  }, [api, activeId, id])
  return state?.id === id ? state : null
}
