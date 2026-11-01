import type { Order, SupplierResult } from '../sourcing/types.ts'
import type { PurchaseOrder, PoStatus, Relationship } from '../supply/types.ts'
import type { PaymentLink } from '../owner-tools/links.ts'
import type { CoachAction } from './coachAction.ts'
import { formatShopPrice, toMinor } from './format.ts'

/**
 * OB-249: an earlier chat card shrinks to one line, "Order · Tea dust 10 kg · Needs your OK".
 * Plain functions of the card's data (no React), so every card type shares one rule and the
 * line is unit tested. Kept in its own module so other locales fall back to English.
 */
const en = {
  order: 'Order',
  suppliers: (item: string) => (item ? `Suppliers for ${item}` : 'Suppliers'),
  found: (n: number) => `${n} found`,
  forecast: 'Forecast',
  next7: 'Next 7 days',
  week: 'This week',
  up: (percent: string) => `Up ${percent}`,
  down: (percent: string) => `Down ${percent}`,
  payment: 'Payment link',
  readyToShare: 'Ready to share',
  rules: 'Supplier rules',
  reply: 'Reply',
  readyToSend: 'Ready to send',
  needsYou: 'Needs your OK',
  needsFix: 'Needs a fix',
  more: (n: number) => `+${n} more`,
  saved: 'Saved',
  replacedByNew: 'Replaced by a new order',
  status: {
    sent: 'Sent',
    changed: 'Changes to check',
    confirmed: 'Confirmed',
    needs_reply: 'Supplier replied',
    dispatched: 'On its way',
    received: 'Arrived',
    invoiced: 'Invoice in',
    closed: 'Done',
    cancelled: 'Cancelled',
    replaced: 'Discarded',
  },
  show: 'Show',
  hide: 'Hide',
}
export type SummaryCopy = typeof en

const hi: SummaryCopy = {
  order: 'ऑर्डर',
  suppliers: (item: string) => (item ? `${item} के सप्लायर` : 'सप्लायर'),
  found: (n: number) => `${n} मिले`,
  forecast: 'अनुमान',
  next7: 'अगले 7 दिन',
  week: 'यह हफ़्ता',
  up: (percent: string) => `${percent} बढ़ी`,
  down: (percent: string) => `${percent} घटी`,
  payment: 'भुगतान लिंक',
  readyToShare: 'भेजने को तैयार',
  rules: 'सप्लायर के नियम',
  reply: 'जवाब',
  readyToSend: 'भेजने को तैयार',
  needsYou: 'मंज़ूरी चाहिए',
  needsFix: 'पहले ठीक करें',
  more: (n: number) => `+${n} और`,
  saved: 'सेव हो गया',
  replacedByNew: 'नए ऑर्डर से बदला गया',
  status: {
    sent: 'भेजा गया',
    changed: 'बदलाव देखें',
    confirmed: 'पक्का',
    needs_reply: 'सप्लायर ने जवाब दिया',
    dispatched: 'रास्ते में',
    received: 'पहुँच गया',
    invoiced: 'बिल आया',
    closed: 'पूरा',
    cancelled: 'रद्द',
    replaced: 'हटाया गया',
  },
  show: 'दिखाएँ',
  hide: 'छिपाएँ',
}

const COPY: Record<string, SummaryCopy> = { en, hi }

export function summaryCopy(locale: string): SummaryCopy {
  return COPY[locale] ?? COPY[locale.split('-')[0] ?? 'en'] ?? en
}

/** A purchase order, or the supply card's order (its chip says when it needs the owner). */
type PoLike = Pick<PurchaseOrder, 'status' | 'blocked' | 'lines'> & { chip?: string }
/** What the line reads of a CoachChart (kept structural: the chart module is React). */
type ChartLike =
  | { type: 'forecast'; items: { item: string }[] }
  | { type: 'insights'; currency: string; revenue: number; change_percent: number | null }

/** The card behind one chat item, with what its line needs to know. */
export type SummaryInput =
  | { kind: 'order'; order: Order }
  | { kind: 'po'; order: PoLike }
  | { kind: 'suppliers'; result: SupplierResult }
  | { kind: 'chart'; chart: ChartLike }
  | { kind: 'payment'; payment: PaymentLink }
  | { kind: 'rules'; row: Relationship }
  | { kind: 'reply'; action: CoachAction; sent: boolean }

export interface CardSummary {
  /** "Order", "Tea dust 10 kg", …: joined with " · " on the line. */
  parts: string[]
  status: string
  /** Still waits for the owner: the line keeps its action and says so. */
  needsYou: boolean
}

function amount(
  lines: { name?: string; item?: string; quantity: number; unit: string }[],
  locale: string,
  c: SummaryCopy,
): string {
  const first = lines[0]
  if (!first) return ''
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const what = `${first.name ?? first.item ?? ''} ${number.format(first.quantity)} ${first.unit}`
  return lines.length > 1 ? `${what} ${c.more(lines.length - 1)}` : what
}

function poStatus(status: PoStatus, c: SummaryCopy): string {
  return status === 'draft' ? c.needsYou : c.status[status]
}

export function cardSummary(input: SummaryInput, locale: string): CardSummary {
  const c = summaryCopy(locale)
  switch (input.kind) {
    case 'order': {
      const { order } = input
      const needsYou = order.status === 'draft' || Boolean(order.pending)
      const status =
        needsYou || order.status === 'draft'
          ? c.needsYou
          : order.replaced_by
            ? c.replacedByNew
            : c.status[order.status]
      return { parts: [c.order, amount(order.lines, locale, c)], status, needsYou }
    }
    case 'po': {
      const { order } = input
      const draft = order.status === 'draft' || order.chip === 'needs_you'
      return {
        parts: [c.order, amount(order.lines, locale, c)],
        status:
          draft && order.blocked ? c.needsFix : draft ? c.needsYou : poStatus(order.status, c),
        // A supplier's changed order waits for the owner's check too.
        needsYou: draft || order.status === 'changed',
      }
    }
    case 'suppliers': {
      const { result } = input
      return {
        parts: [c.suppliers(result.item)],
        status: c.found(result.suppliers.length),
        needsYou: false,
      }
    }
    case 'chart': {
      const { chart } = input
      if (chart.type === 'forecast')
        return {
          parts: [c.forecast, chart.items.map((row) => row.item).join(', ')],
          status: c.next7,
          needsYou: false,
        }
      const change = chart.change_percent
      const percent =
        change == null
          ? ''
          : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
              Math.abs(change) / 100,
            )
      return {
        parts: [
          c.week,
          formatShopPrice(toMinor(chart.revenue, chart.currency), chart.currency, locale),
        ],
        status: change == null || change === 0 ? '' : change > 0 ? c.up(percent) : c.down(percent),
        needsYou: false,
      }
    }
    case 'payment': {
      const { payment } = input
      const currency = payment.rail === 'paynow' ? payment.currency : 'INR'
      return {
        parts: [
          c.payment,
          formatShopPrice(toMinor(Number(payment.amount), currency), currency, locale),
        ],
        status: c.readyToShare,
        needsYou: false,
      }
    }
    case 'rules': {
      const { row } = input
      return {
        parts: [c.rules, row.supplier.name],
        status: row.pending ? c.needsYou : c.saved,
        needsYou: Boolean(row.pending),
      }
    }
    case 'reply':
      return {
        parts: [c.reply, input.action.label],
        status: input.sent ? c.status.sent : c.readyToSend,
        needsYou: !input.sent,
      }
  }
}

/** The whole line as read out: "Order · Tea dust 10 kg · Needs your OK". */
export function summaryText(summary: CardSummary): string {
  return [...summary.parts, summary.status].filter(Boolean).join(' · ')
}
