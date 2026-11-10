import { useSyncExternalStore } from 'react'
import type { components } from '../../../api/generated'

/**
 * The owner's choices about Today cards (OB-176): cards hidden until tomorrow ("Not now"), kinds
 * resting two weeks ("Not useful") and how often cards come. The server keeps them per shop (they
 * arrive with the Today facts); this store holds the newest answer from a tap, so a dismissed
 * card leaves at once and the You screen's setting and Today agree without a reload.
 */
export type TodayCards = components['schemas']['TodayCards']
export type Frequency = TodayCards['frequency']
export type Reason = 'not_now' | 'not_useful'

const latest = new Map<string, TodayCards>()
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The shop's choices: the newest tap's answer, else what the Today facts said. */
export function useCardChoices(shopId: string | undefined, fromFacts: TodayCards | undefined) {
  const tapped = useSyncExternalStore(
    subscribe,
    () => (shopId ? latest.get(shopId) : undefined),
    () => undefined,
  )
  return tapped ?? fromFacts
}

/** Facts loaded again: they already hold every saved choice, so they lead from now on. */
export function factsReloaded(shopId: string) {
  if (latest.delete(shopId)) changed()
}

type Api = <T>(path: string, init?: RequestInit) => Promise<T>

async function save(
  api: Api,
  shopId: string,
  path: string,
  body: object,
  optimistic: TodayCards | undefined,
): Promise<boolean> {
  const before = latest.get(shopId)
  if (optimistic) {
    latest.set(shopId, optimistic)
    changed()
  }
  try {
    const saved = await api<TodayCards>(`/businesses/${encodeURIComponent(shopId)}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    latest.set(shopId, saved)
    changed()
    return true
  } catch {
    if (before) latest.set(shopId, before)
    else latest.delete(shopId)
    changed()
    return false
  }
}

/** X on a card: hidden at once, saved for every phone; false (and back on Today) if it failed. */
export function dismissCard(
  api: Api,
  shopId: string,
  current: TodayCards | undefined,
  card: string,
  reason: Reason,
): Promise<boolean> {
  const base = current ?? { frequency: 'daily', hidden: [], resting: [], supplier_replies: [] }
  const optimistic =
    reason === 'not_now'
      ? { ...base, hidden: [...base.hidden, card] }
      : { ...base, resting: [...base.resting, cardKind(card)] }
  return save(api, shopId, '/today/cards/dismiss', { card, reason }, optimistic)
}

export function setFrequency(
  api: Api,
  shopId: string,
  current: TodayCards | undefined,
  frequency: Frequency,
): Promise<boolean> {
  return save(
    api,
    shopId,
    '/today/cards/frequency',
    { frequency },
    current && { ...current, frequency },
  )
}

/** "low-Milk" → "low": "Not useful" rests every card of that kind (the server's rule too). */
export function cardKind(card: string): string {
  return card.split('-', 1)[0] ?? card
}
