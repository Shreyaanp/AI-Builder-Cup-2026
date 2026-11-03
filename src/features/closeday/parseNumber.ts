import { exponent } from '../v1/format.js'

/** A non-negative close-day quantity or amount; null means the entry needs correction. */
export function parseCloseDayNumber(text: string, locale: string, currency = 'INR'): number | null {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const parts = formatter.formatToParts(1234567.89)
  const group = parts.find((part) => part.type === 'group')?.value
  const decimal = parts.find((part) => part.type === 'decimal')!.value
  const digits = new Intl.NumberFormat(locale, { useGrouping: false })
  const normalize = (input: string) => {
    for (let digit = 0; digit <= 9; digit++) {
      input = input.replaceAll(digits.format(digit), String(digit))
    }
    return input
  }
  const input = normalize(text.trim())
  const [integer = '', fraction, ...extra] = input.split(decimal)
  if (
    extra.length ||
    (fraction !== undefined && (!/^\d+$/.test(fraction) || fraction.length > exponent(currency)))
  )
    return null

  let whole = integer
  if (group && integer.includes(group)) {
    const groups = integer.split(group)
    whole = groups.join('')
    if (!/^\d+$/.test(whole)) return null
    // Validate grouping before removing it. Indian owners also use western thousands;
    // Kannada's Intl default is western, but lakh grouping is common too.
    const grouped = normalize(formatter.format(BigInt(whole))) === integer
    const western = /^[1-9]\d{0,2}(?:,\d{3})+$/.test(groups.join(','))
    const indianLocale = /^(en|hi|bn|ta|te|mr|kn)(-|$)/i.test(locale) || /-IN(?:-|$)/i.test(locale)
    const indian = indianLocale && /^[1-9]\d?(?:,\d{2})*,\d{3}$/.test(groups.join(','))
    if (!grouped && !western && !indian) return null
  }
  if (!/^\d+$/.test(whole)) return null
  const value = Number(fraction === undefined ? whole : `${whole}.${fraction}`)
  return Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER ? value : null
}
