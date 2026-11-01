import { useCallback, useEffect, useState } from 'react'
import { ApiError, type Api, type Proposal } from '../v1/api'
import { isServiceShop } from '../v1/tabsCopy'
import { useWorkspace } from '../v1/workspaceContext'
import { useLocale } from '../../state/hooks'
import { productName } from '../../i18n/productNames'
import { useSupplyCopy } from './copy'
import { useOrderChangeCopy } from './orderChangeCopy'
import { supplyBus, supplyChanged } from './supplyEvents'
import type { PurchaseOrder, Relationship, RuleSet } from './types'

/** One supply need from `GET /supply`: the backend is the only "runs out" and "on order" rule. */
export interface SupplyNeed {
  item: string
  runs_out: string
  stock: number
  supplied?: boolean
  /** Already ordered and on its way, in the item's unit, and the earliest arrival. */
  on_order?: number
  arrives?: string
  /** On its way in a unit that does not convert (2 pack against litres): never nothing. */
  on_order_other?: { quantity: number; unit: string; arrives: string }[]
  /** full: nothing to add; units: on order in another unit, ask first; partly; none. */
  cover?: 'full' | 'units' | 'partly' | 'none'
  /** Handled already (full or units): such needs come after the ones still to order. */
  covered?: boolean
}

interface SupplyOverview {
  suppliers: Relationship[]
  orders: PurchaseOrder[]
  needs?: SupplyNeed[]
}

/**
 * The need to show first: the first one not yet covered (the backend sorts those first), else
 * the first need; and how many more still need ordering. Today and Grow both read this (#603).
 */
export function leadNeed(needs: SupplyNeed[] | undefined) {
  const open = (needs ?? []).filter((need) => !need.covered)
  return { need: open[0] ?? needs?.[0], more: Math.max(0, open.length - 1) }
}

// One shop's supply, shared by every view of it (Today, the Grow tile, the Purchase orders
// sheet): a load anywhere shows everywhere, and any order change loads it again, so a tile never
// says "on order" after a cancel or "Find suppliers" after an approve on the same screen (#603).
let shared: { id: string; data: SupplyOverview; generation: number } | null = null
let inflight: { key: string; generation: number; promise: Promise<void> } | null = null
let generation = 0
// A change makes any answer already on its way old: the next load asks again.
supplyBus.addEventListener('changed', () => {
  generation += 1
})

function load(api: Api, id: string, fresh: boolean, revision?: number): Promise<void> {
  if (fresh) generation += 1
  // Views opening together share one request; a new shop revision (a stock edit) asks again.
  const key = `${id}:${revision ?? ''}`
  if (inflight && inflight.key === key && inflight.generation === generation)
    return inflight.promise
  const mine = generation
  const promise = api<SupplyOverview>(`/businesses/${encodeURIComponent(id)}/supply`).then(
    (data) => {
      // An older answer landing after a newer one must not bring the old state back.
      if (shared && shared.id === id && shared.generation > mine) return
      shared = { id, data, generation: mine }
      supplyBus.dispatchEvent(new Event('loaded'))
    },
  )
  inflight = { key, generation: mine, promise }
  // Shared while on its way only: a view opening later asks again.
  const done = () => {
    if (inflight?.promise === promise) inflight = null
  }
  promise.then(done, done)
  return promise
}

/** The shop's supplier relationships, purchase orders (newest first) and supply needs. */
export function useSupply(open: boolean) {
  const { api, activeId, active } = useWorkspace()
  const [loaded, setLoaded] = useState(shared)
  const revision = active?.revision
  const refresh = useCallback(async () => {
    if (!activeId) return
    try {
      await load(api, activeId, true, revision)
    } catch {
      // Keep what is shown; the next refresh tries again.
    }
  }, [api, activeId, revision])
  useEffect(() => {
    const show = () => setLoaded(shared)
    const reload = () => {
      if (open && activeId) load(api, activeId, false, revision).catch(() => undefined)
    }
    supplyBus.addEventListener('loaded', show)
    supplyBus.addEventListener('changed', reload)
    return () => {
      supplyBus.removeEventListener('loaded', show)
      supplyBus.removeEventListener('changed', reload)
    }
  }, [api, activeId, open, revision])
  useEffect(() => {
    if (!open || !activeId) return
    // Async on purpose: the list arrives after this effect, never synchronously inside it.
    const first = window.setTimeout(
      () => load(api, activeId, false, revision).catch(() => undefined),
      0,
    )
    return () => window.clearTimeout(first)
  }, [open, api, activeId, revision])
  return { data: loaded?.id === activeId ? loaded.data : null, refresh }
}

export type SimVariant = 'full' | 'partial' | 'substitute' | 'match' | 'price_mismatch'

/**
 * Every owner action on a purchase order. Each returns the updated order (or null after a
 * visible error); a stale version reloads the latest so the card never shows an old state.
 */
export function usePoActions(onChange: (order: PurchaseOrder) => void) {
  const { api, activeId, notify, review } = useWorkspace()
  const s = useSupplyCopy()
  const change = useOrderChangeCopy()
  const base = `/businesses/${encodeURIComponent(activeId ?? '')}/supply`
  const explain = useCallback(
    (cause: unknown): string => {
      const detail = cause instanceof ApiError ? cause.code : ''
      if (detail === 'RULES_BROKEN') return s.rulesBroken
      if (detail === 'TOO_BIG') return change.tooBig
      if (detail === 'RESOLVE_FLAGS') return s.resolveFirst
      if (detail === 'RECEIVE_FIRST') return s.receiveFirst
      if (detail === 'UNREADABLE_DOCUMENT') return s.unreadable
      if (detail.startsWith('EXPECTED_'))
        return s.expected(s.step[detail.slice(9) as keyof typeof s.step] ?? detail.slice(9))
      if (detail === 'STALE') return s.stale
      return s.failed
    },
    [s, change],
  )
  const run = useCallback(
    async (order: PurchaseOrder, path: string, body: Record<string, unknown> = {}) => {
      try {
        const result = await api<PurchaseOrder | { order: PurchaseOrder; proposal: Proposal }>(
          `${base}/orders/${encodeURIComponent(order.id)}/${path}`,
          { method: 'POST', body: JSON.stringify({ version: order.version, ...body }) },
        )
        const next = 'order' in result ? result.order : result
        onChange(next)
        supplyChanged()
        if ('proposal' in result && result.proposal) review(result.proposal)
        return next
      } catch (cause) {
        notify(explain(cause))
        if (cause instanceof ApiError && cause.code === 'STALE') {
          try {
            onChange(await api<PurchaseOrder>(`${base}/orders/${encodeURIComponent(order.id)}`))
          } catch {
            // The notice already told the owner; the next refresh brings the latest.
          }
        }
        return null
      }
    },
    [api, base, notify, onChange, review, explain],
  )
  // The demo supplier's reply arrives with a read; only a real change is passed on.
  const refresh = useCallback(
    async (order: PurchaseOrder) => {
      try {
        const next = await api<PurchaseOrder>(`${base}/orders/${encodeURIComponent(order.id)}`)
        if (next.version === order.version) return
        onChange(next)
        supplyChanged()
      } catch {
        // The next check tries again; nothing here needs the owner.
      }
    },
    [api, base, onChange],
  )
  return {
    refresh,
    approve: (order: PurchaseOrder) => run(order, 'approve'),
    cancel: (order: PurchaseOrder) => run(order, 'cancel'),
    fix: (order: PurchaseOrder, fix: unknown) => run(order, 'fix', { fix }),
    simulate: (order: PurchaseOrder, variant: SimVariant) => run(order, 'simulate', { variant }),
    inbound: (order: PurchaseOrder, text: string) => run(order, 'inbound', { text }),
    resolve: (order: PurchaseOrder, flagId: string, value: string) =>
      run(order, `flags/${encodeURIComponent(flagId)}`, { value }),
    accept: (order: PurchaseOrder) => run(order, 'accept'),
    received: (order: PurchaseOrder) => run(order, 'received'),
  }
}

interface ReorderResult {
  status:
    | 'drafted'
    | 'needs_item'
    | 'no_supplier'
    | 'on_order'
    | 'on_order_units'
    | 'check'
    | 'made'
    | 'ask_source'
  order?: PurchaseOrder
  item?: string
  unit?: string
  quantity?: number | null
  /**
   * `check`: how many days of the shop's own use the quantity would be; null when the supplier's
   * unit does not convert to the shop's (OB-239).
   */
  days?: number | null
  /** `check`: why nothing was drafted (`no_history`: no use of its own on record). */
  reason?: string
  supplier_quantity?: number
  supplier_unit?: string
  arrives?: string
  other?: { quantity: number; unit: string; arrives: string }[]
}

/**
 * Drafts the reorder. When nothing is drafted, `note` says why and what to do next (nothing runs
 * out, no supplier, or it is already on order: OB-226, OB-227); the caller shows it in place.
 * Some on order in a unit that does not convert sets `ask` to the item: the caller offers
 * "Order more", which drafts again with `anyway` (#603).
 */
export function useDraftReorder() {
  const { api, activeId, active } = useWorkspace()
  const services = isServiceShop(active?.fields.category)
  const s = useSupplyCopy()
  const c = useOrderChangeCopy()
  const locale = useLocale()
  return useCallback(
    async (
      item = '',
      anyway = false,
    ): Promise<{ order: PurchaseOrder | null; note: string; ask?: string }> => {
      try {
        const result = await api<ReorderResult>(
          `/businesses/${encodeURIComponent(activeId ?? '')}/supply/reorder`,
          { method: 'POST', body: JSON.stringify({ ...(item ? { item } : {}), anyway }) },
        )
        supplyChanged()
        if (result.order) return { order: result.order, note: '' }
        const name = productName(result.item ?? item, locale)
        const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
        if (result.status === 'on_order_units')
          return {
            order: null,
            ask: result.item ?? item,
            note: c.unitsAsk(
              (result.other ?? [])
                .map((row) => `${quantity.format(row.quantity)} ${row.unit}`)
                .join(', '),
              name,
              dayLabel(result.other?.[0]?.arrives ?? '', locale),
            ),
          }
        if (result.status === 'check')
          return {
            order: null,
            note:
              result.reason === 'no_history'
                ? c.checkUse(name)
                : result.days == null
                  ? c.checkUnits(
                      quantity.format(result.supplier_quantity ?? 0),
                      result.supplier_unit ?? '',
                      name,
                      result.unit ?? '',
                    )
                  : c.checkQuantity(
                      quantity.format(result.quantity ?? 0),
                      result.unit ?? '',
                      name,
                      result.days,
                    ),
          }
        if (result.status === 'made') return { order: null, note: c.madeHere(name) }
        if (result.status === 'ask_source')
          return { order: null, note: c.askSource(name, services) }
        const note =
          result.status === 'on_order'
            ? c.onOrder(
                quantity.format(result.quantity ?? 0),
                result.unit ?? '',
                name,
                dayLabel(result.arrives ?? '', locale),
              )
            : result.status === 'no_supplier'
              ? c.noSupplierFor(name)
              : c.nothingToReorder
        return { order: null, note }
      } catch {
        return { order: null, note: s.failed }
      }
    },
    [api, activeId, services, s, c, locale],
  )
}

export function useRulesActions() {
  const { api, activeId, notify } = useWorkspace()
  const s = useSupplyCopy()
  const base = `/businesses/${encodeURIComponent(activeId ?? '')}/supply/suppliers`
  const save = useCallback(
    async (row: Relationship, rules: RuleSet): Promise<Relationship | null> => {
      try {
        const saved = await api<Relationship>(
          `${base}/${encodeURIComponent(row.supplier.id)}/rules`,
          { method: 'PUT', body: JSON.stringify({ version: row.version, rules }) },
        )
        notify(s.saved)
        return saved
      } catch (cause) {
        notify(cause instanceof ApiError && cause.code === 'STALE' ? s.stale : s.failed)
        return null
      }
    },
    [api, base, notify, s],
  )
  const confirm = useCallback(
    async (row: Relationship, apply: boolean): Promise<Relationship | null> => {
      try {
        const saved = await api<Relationship>(
          `${base}/${encodeURIComponent(row.supplier.id)}/rules/confirm`,
          { method: 'POST', body: JSON.stringify({ version: row.version, apply }) },
        )
        notify(apply ? s.ruleConfirmed : s.ruleKept)
        return saved
      } catch {
        notify(s.failed)
        return null
      }
    },
    [api, base, notify, s],
  )
  return { save, confirm }
}

/** "Fri 17 Oct" in the owner's language, from an ISO date. */
export function dayLabel(iso: string, locale: string): string {
  if (!iso) return ''
  const day = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(day.getTime())) return iso
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(day)
}

/** What is on its way for a need, each in its own unit: "12 l on order, arriving Sat, Oct 31"
 * or "2 pack on order", joined when both (#603). Empty when nothing is. */
export function useOnOrderText() {
  const c = useOrderChangeCopy()
  const locale = useLocale()
  const { products } = useWorkspace()
  return useCallback(
    (need: SupplyNeed) => {
      const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
      const unit = products.find((p) => p.name === need.item)?.unit ?? ''
      return [
        ...(need.on_order ? [{ quantity: need.on_order, unit, arrives: need.arrives ?? '' }] : []),
        ...(need.on_order_other ?? []),
      ]
        .map((row) =>
          c.onOrderLine(number.format(row.quantity), row.unit, dayLabel(row.arrives, locale)),
        )
        .join(' · ')
    },
    [c, locale, products],
  )
}
