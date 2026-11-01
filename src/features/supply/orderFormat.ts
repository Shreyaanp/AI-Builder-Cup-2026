import type { PurchaseOrder } from './types.ts'

/** The number without a leading "PO-"/"PO " so the copy's own "PO" prefix is not doubled. */
export function poNumber(number: string | number | null | undefined): string {
  return String(number ?? '')
    .trim()
    .replace(/^PO[-\s]*/i, '')
}

/** Order total in minor units: the stated total, else the sum of line totals, else null. */
export function orderTotal(order: Pick<PurchaseOrder, 'total' | 'lines'>): number | null {
  if (typeof order.total === 'number' && Number.isFinite(order.total)) return order.total
  const lines = order.lines ?? []
  if (lines.length === 0) return null
  let sum = 0
  for (const line of lines) {
    const value =
      line.total ??
      (line.price != null && line.quantity != null ? line.price * line.quantity : null)
    if (value == null || !Number.isFinite(value)) return null
    sum += value
  }
  return sum
}

/** The credit-terms phrase, or '' when the supplier's rules leave the days out. */
export function termsLabel(
  terms: (days: number) => string,
  days: number | null | undefined,
): string {
  return days == null ? '' : terms(days)
}

/** What an order is called on screen: the item and the supplier, never the order number. */
export function orderLabel(
  order: Pick<PurchaseOrder, 'lines' | 'supplier' | 'reason'>,
  title: (item: string, supplier: string) => string,
): string {
  return title(order.reason?.item || order.lines?.[0]?.item || '', order.supplier.name)
}

/** "18 kg +3": what an order is for at a glance, so two orders of one item never read alike. */
export function orderSize(order: Pick<PurchaseOrder, 'lines'>): string {
  const [first, ...rest] = order.lines ?? []
  if (!first) return ''
  const size = `${first.quantity ?? 0} ${first.unit ?? ''}`.trim()
  return rest.length ? `${size} +${rest.length}` : size
}
