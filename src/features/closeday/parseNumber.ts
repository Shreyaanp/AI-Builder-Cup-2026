import { currencyMarks, exponent } from '../v1/format.js'

/** Money keeps the currency's minor digits; quantities allow grams and half-kilos (0.125 kg). */
export type NumberKind = 'money' | 'quantity'
export const QUANTITY_DECIMALS = 3

export type NumberReading =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'invalid' }
  /** One separator that could be a decimal or a thousands mark ("1,5" where "." is decimal). */
  | { ok: false; reason: 'ambiguous'; options: [number, number] }

const INDIAN_LANGUAGE = /^(en|hi|bn|ta|te|mr|kn)(-|$)/i
const INDIAN_REGION = /-IN(?:-|$)/i
// Ways people write rupees before or after a number: ₹ 1,000 · Rs. 1,000 · 1,000 रु
const RUPEE_MARKS = ['₹', 'Rs.', 'Rs', 'INR', 'रु.', 'रु', 'रुपये']

function separators(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.89)
  return {
    group: parts.find((part) => part.type === 'group')?.value,
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
  }
}

/** The currency mark typed before or after the number ("₹ 1,000", "1.000 Rp"), removed once. */
function withoutCurrency(input: string, locale: string, currency: string): string {
  const code = currency.toUpperCase()
  const marks = new Set([...currencyMarks(code, locale), ...(code === 'INR' ? RUPEE_MARKS : [])])
  // Longest first, so "Rs." goes before "Rs".
  for (const mark of [...marks].sort((a, b) => b.length - a.length)) {
    const lower = input.toLowerCase()
    if (lower.startsWith(mark.toLowerCase())) return input.slice(mark.length).trim()
    if (lower.endsWith(mark.toLowerCase())) return input.slice(0, -mark.length).trim()
  }
  return input
}

/**
 * The one close-day number reader for every typed amount and quantity. `locale` is the number
 * locale (the shop currency's, via moneyLocale): its group and decimal marks decide "1,000"
 * (a thousand in an Indian shop) and "2,5" (two and a half where the comma is the decimal).
 * A lone group mark before one or two digits is a question for the owner, never a guess.
 */
export function readCloseDayNumber(
  text: string,
  locale: string,
  currency = 'INR',
  kind: NumberKind = 'money',
): NumberReading {
  const { group, decimal } = separators(locale)
  const digits = new Intl.NumberFormat(locale, { useGrouping: false })
  const normalize = (input: string) => {
    for (let digit = 0; digit <= 9; digit++) {
      input = input.replaceAll(digits.format(digit), String(digit))
    }
    return input
  }
  let input = normalize(text.trim())
  if (!input) return { ok: false, reason: 'empty' }
  if (kind === 'money') input = withoutCurrency(input, locale, currency)
  const places = kind === 'money' ? exponent(currency) : QUANTITY_DECIMALS
  const fits = (fraction: string) => /^\d+$/.test(fraction) && fraction.length <= places

  const [integer = '', fraction, ...extra] = input.split(decimal)
  if (extra.length || (fraction !== undefined && !fits(fraction)))
    return { ok: false, reason: 'invalid' }

  let whole = integer
  if (group && integer.includes(group)) {
    const groups = integer.split(group)
    whole = groups.join('')
    if (!/^\d+$/.test(whole)) return { ok: false, reason: 'invalid' }
    if (fraction === undefined && groups.length === 2 && /^\d{1,2}$/.test(groups[1]!)) {
      // "1,5" in an Indian shop: one and a half, or fifteen? Ask instead of saving either.
      const asDecimal = groups[1]!
      if (!fits(asDecimal)) return { ok: false, reason: 'invalid' }
      return {
        ok: false,
        reason: 'ambiguous',
        options: [Number(`${groups[0]}.${asDecimal}`), Number(whole)],
      }
    }
    // Validate grouping before removing it. Indian owners also use western thousands;
    // Kannada's Intl default is western, but lakh grouping is common too.
    const shape = groups.join(',')
    const grouped =
      normalize(
        new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(whole)),
      ) === integer
    const western = /^[1-9]\d{0,2}(?:,\d{3})+$/.test(shape)
    const indianLocale = INDIAN_LANGUAGE.test(locale) || INDIAN_REGION.test(locale)
    const indian = indianLocale && /^[1-9]\d?(?:,\d{2})*,\d{3}$/.test(shape)
    if (!grouped && !western && !indian) return { ok: false, reason: 'invalid' }
  }
  if (!/^\d+$/.test(whole)) return { ok: false, reason: 'invalid' }
  const value = Number(fraction === undefined ? whole : `${whole}.${fraction}`)
  return Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER
    ? { ok: true, value }
    : { ok: false, reason: 'invalid' }
}

/** A non-negative close-day quantity or amount; null means the entry needs correction. */
export function parseCloseDayNumber(
  text: string,
  locale: string,
  currency = 'INR',
  kind: NumberKind = 'money',
): number | null {
  const reading = readCloseDayNumber(text, locale, currency, kind)
  return reading.ok ? reading.value : null
}
