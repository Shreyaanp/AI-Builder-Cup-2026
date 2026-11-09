import { toMajor, toMinor } from '../v1/format'
import { readNumber } from '../v1/readNumber'
import type { NumberReading } from '../v1/readNumber'

/** Major units, as the owner typed them; the split is only there when they gave one. */
export type DayTotalEntry = { total: number; cash: number | null; upi: number | null }
export type DayTotalText = { total: string; cash: string; upi: string }

export const NO_TOTAL: DayTotalText = { total: '', cash: '', upi: '' }

/**
 * What the three fields come to. Only the total is needed. Cash and UPI are optional, one gives
 * the other, and with no total the two of them are the total. `problem` keeps Check from moving on.
 */
export function readDayTotal(
  text: DayTotalText,
  currency: string,
  locale: string,
): { entry: DayTotalEntry | null; started: boolean; sum: number | null; total: number | null } {
  const read = (value: string) => readNumber(value, locale, currency, 'money')
  const minor = (reading: NumberReading) => (reading.ok ? toMinor(reading.value, currency) : null)
  const typedTotal = minor(read(text.total))
  let cash = minor(read(text.cash))
  let upi = minor(read(text.upi))
  const started = Boolean(text.total.trim() || text.cash.trim() || text.upi.trim())
  const unreadable =
    (text.total.trim() && typedTotal === null) ||
    (text.cash.trim() && cash === null) ||
    (text.upi.trim() && upi === null)
  const total = typedTotal ?? (cash !== null && upi !== null ? cash + upi : null)
  if (unreadable || total === null || total <= 0)
    return { entry: null, started, sum: null, total: null }
  if (cash !== null && upi === null) upi = total - cash
  if (upi !== null && cash === null) cash = total - upi
  const split = cash !== null && upi !== null
  if (split && (cash! < 0 || upi! < 0 || cash! + upi! !== total))
    return {
      entry: null,
      started,
      sum: (minor(read(text.cash)) ?? 0) + (minor(read(text.upi)) ?? 0),
      total,
    }
  return {
    entry: {
      total: toMajor(total, currency),
      cash: split ? toMajor(cash!, currency) : null,
      upi: split ? toMajor(upi!, currency) : null,
    },
    started,
    sum: null,
    total,
  }
}
