import { CURRENCIES, formatAmount, formatPrice, toMinor } from '../v1/format.js'

const currencies = new Set(CURRENCIES)
// Saved fixture replies use ISO codes and English numeric punctuation on the wire.
const price = /\b([A-Z]{3})[ \u00a0]+(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?!\d|,\d|\.\d)/g

/** Display prices in generated replies through the same formatter as the shop menu. The written
 * precision is kept: "INR 540" reads ₹540 and "INR 18.00" reads ₹18.00. */
export function formatMoneyText(text: string, locale: string): string {
  return text.replace(price, (original: string, currency: string, amount: string) => {
    if (!currencies.has(currency)) return original
    const value = Number(amount.replaceAll(',', ''))
    const minor = toMinor(value, currency)
    if (!Number.isSafeInteger(minor)) return original
    return amount.includes('.')
      ? formatPrice(minor, currency, locale)
      : formatAmount(value, currency, locale)
  })
}
