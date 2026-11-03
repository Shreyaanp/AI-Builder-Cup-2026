import { useLocale } from '../../state/hooks'
import { productName } from '../../i18n/productNames'
import type { Product, Proposal } from './api'

/**
 * After a confirmed change marks items sold out ("Samosa sold out", "समोसा खत्म हो गया"), the
 * saved note offers Undo, the same one tap back as the sold-out switch (OB-261). Kept in its own
 * module so languages without copy here fall back to English.
 */
const en = {
  soldOut: (names: string) => `${names}: sold out for today`,
  undo: 'Undo',
  back: (names: string) => `${names}: on sale again`,
}
type Copy = typeof en
const hi: Copy = {
  soldOut: (names: string) => `${names}: आज के लिए ख़त्म`,
  undo: 'वापस लें',
  back: (names: string) => `${names}: फिर से बिक्री पर`,
}
const COPY: Record<string, Copy> = { en, hi }

export function useSoldOutUndoCopy(): Copy & { names: (items: string[]) => string } {
  const locale = useLocale()
  const copy = COPY[locale.split('-')[0] ?? 'en'] ?? en
  return { ...copy, names: (items) => items.map((name) => productName(name, locale)).join(', ') }
}

/** Items this proposal marks sold out that were on sale before it. */
export function newlySoldOut(proposal: Proposal | null, before: Product[]): string[] {
  if (!proposal || proposal.snapshot.kind !== 'inventory') return []
  const onSale = new Set(before.filter((item) => item.available !== false).map((p) => p.name))
  return proposal.snapshot.products
    .filter((item) => item.available === false && onSale.has(item.name))
    .map((item) => item.name)
}
