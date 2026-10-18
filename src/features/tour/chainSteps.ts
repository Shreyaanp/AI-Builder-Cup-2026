import { dayLabel } from '../supply/supplyData'
import { formatPrice } from '../v1/format'
import type { ChainCopy } from './chainCopy'
import type { ChainState } from './chainData'
import { short } from './chainData'

export const CHAIN_STEPS = 6

/** "8 kg", "30 litre" in the owner's language. */
export function amount(quantity: number, unit: string, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(quantity)} ${unit}`
}

/** The spotlight card's two short lines for one story step, from the seeded records. */
export function chainStep(
  index: number,
  state: ChainState,
  c: ChainCopy,
  locale: string,
): { title: string; body: string } {
  const titles = [
    c.forecast,
    c.order.title,
    c.wholesaler.title,
    c.chain.title,
    c.arrived.title,
    c.customers.title,
  ]
  if (!state || 'failed' in state)
    return { title: titles[index] ?? '', body: state ? c.failed : c.loading }
  const s = state.story
  const money = (minor: number) => formatPrice(minor, s.currency, locale)
  const day = (iso: string) => dayLabel(iso, locale)
  const arrived = s.arrived[0]
  const steps = [
    {
      title: c.today.title(s.today.item, day(s.today.runs_out)),
      body: c.today.body(
        amount(s.today.stock, s.today.unit, locale),
        amount(s.today.daily, s.today.unit, locale),
      ),
    },
    {
      title: c.order.title,
      body: c.order.body(short(s.order.partner), s.order.lines.length, money(s.order.total)),
    },
    {
      title: c.wholesaler.title,
      // Never a sentence with a blank name: before the wholesaler's books are seeded, say so.
      body: s.wholesaler.restock
        ? c.wholesaler.body(short(s.wholesaler.restock.partner))
        : c.failed,
    },
    {
      title: c.chain.title,
      body: s.chain ? c.chain.body(short(s.chain.name), s.chain.outlets) : c.failed,
    },
    {
      title: c.arrived.title,
      body: arrived
        ? c.arrived.body(
            arrived.item,
            amount(arrived.before, arrived.unit, locale),
            amount(arrived.after, arrived.unit, locale),
            day(arrived.runs_out_after || arrived.covered_until),
          )
        : c.failed,
    },
    {
      title: c.customers.title,
      body: c.customers.body(
        s.customers.stamps_today ?? 0,
        s.customers.stamps_needed,
        s.customers.reward,
      ),
    },
  ]
  return steps[index] ?? { title: '', body: '' }
}
