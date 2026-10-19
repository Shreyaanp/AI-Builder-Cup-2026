import { dayLabel } from '../supply/supplyData'
import { formatPrice } from '../v1/format'
import type { ChainCopy } from './chainCopy'
import type { ChainState } from './chainData'
import { short } from './chainData'

/** "8 kg", "30 litre" in the owner's language. */
export function amount(quantity: number, unit: string, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(quantity)} ${unit}`
}

/**
 * The spotlight card's two short lines for the Today supply card (0) and its Reorder button (1),
 * from the shop's seeded records. Both point at what is really on the Coach screen.
 */
export function chainStep(
  index: number,
  state: ChainState,
  c: ChainCopy,
  locale: string,
): { title: string; body: string } {
  const titles = [c.forecast, c.order.title]
  if (!state || 'failed' in state)
    return { title: titles[index] ?? '', body: state ? c.failed : c.loading }
  const s = state.story
  const money = (minor: number) => formatPrice(minor, s.currency, locale)
  const steps = [
    {
      title: c.today.title(s.today.item, dayLabel(s.today.runs_out, locale)),
      body: c.today.body(
        amount(s.today.stock, s.today.unit, locale),
        amount(s.today.daily, s.today.unit, locale),
      ),
    },
    {
      title: c.order.title,
      body: c.order.body(short(s.order.partner), s.order.lines.length, money(s.order.total)),
    },
  ]
  return steps[index] ?? { title: '', body: '' }
}
