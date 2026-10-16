import { CURRENCIES, formatPrice, toMinor } from '../v1/format.js'

const currencies = new Set(CURRENCIES)
// Saved fixture replies use ISO codes and English numeric punctuation on the wire.
const price = /\b([A-Z]{3})[ \u00a0]+(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?!\d|,\d|\.\d)/g

/** Display prices in generated replies through the same formatter as the shop menu. */
export function formatMoneyText(text: string, locale: string): string {
  return text.replace(price, (original: string, currency: string, amount: string) => {
    if (!currencies.has(currency)) return original
    const minor = toMinor(Number(amount.replaceAll(',', '')), currency)
    return Number.isSafeInteger(minor) ? formatPrice(minor, currency, locale) : original
  })
}
