import { useEffect, useState } from 'react'
import { useWorkspace } from '../v1/workspaceContext'

export interface ChainLine {
  item: string
  quantity: number
  unit: string
  price: number | null
  total: number | null
}

export interface ChainOrder {
  number: string
  partner: string
  currency: string
  total: number
  lines: ChainLine[]
  documents: string[]
  received: boolean
}

/** The tour's one order, from the tea stall to the wholesaler to the chain (seeded records). */
export interface ChainStory {
  city: string
  shop: string
  currency: string
  today: {
    item: string
    unit: string
    stock: number
    daily: number
    runs_out: string
    method: string
  }
  order: ChainOrder & { message: string }
  wholesaler: {
    name: string
    inbound: (ChainOrder & { message: string }) | null
    restock: (ChainOrder & { csv: string }) | null
  }
  chain: { name: string; outlets: string; order: ChainOrder & { idocs: string[] } } | null
  arrived: {
    item: string
    unit: string
    before: number
    after: number
    runs_out_before: string
    runs_out_after: string
    covered_until: string
  }[]
  customers: {
    stamps_today: number | null
    returning_today: number | null
    stamps_needed: number
    reward: string
  }
}

export type ChainState = { story: ChainStory } | { failed: true } | null

/** Loaded once per tour for the selected tour shop; null while loading. */
export function useChainStory(running: boolean): ChainState {
  const { api, activeId } = useWorkspace()
  const [loaded, setLoaded] = useState<{ id: string; state: ChainState } | null>(null)
  useEffect(() => {
    if (!running || !activeId) return
    let live = true
    api<ChainStory>(`/demo/chain/${encodeURIComponent(activeId)}`)
      .then((story) => live && setLoaded({ id: activeId, state: { story } }))
      .catch(() => live && setLoaded({ id: activeId, state: { failed: true } }))
    return () => {
      live = false
    }
  }, [running, activeId, api])
  return loaded?.id === activeId ? loaded.state : null
}

/** "Sri Lakshmi Provisions" for a spoken line; panels keep the full "(Demo)" name. */
export function short(name: string): string {
  return name.replace(/\s*\((Demo|Tour)\)/g, '').trim()
}
