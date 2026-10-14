/** Currency for a region (ISO 3166 → ISO 4217). APAC first; Singapore is the default market. */
const REGION_CURRENCY: Record<string, string> = {
  SG: 'SGD',
  MY: 'MYR',
  ID: 'IDR',
  TH: 'THB',
  VN: 'VND',
  PH: 'PHP',
  JP: 'JPY',
  KR: 'KRW',
  CN: 'CNY',
  HK: 'HKD',
  TW: 'TWD',
  AU: 'AUD',
  NZ: 'NZD',
  IN: 'INR',
  US: 'USD',
  GB: 'GBP',
}

/** Default currency from the phone's region (e.g. en-SG → SGD); Singapore otherwise. */
export function defaultCurrency(languages: readonly string[] = navigator.languages ?? []): string {
  for (const tag of languages) {
    const region = tag.split('-').find((part, index) => index > 0 && /^[A-Z]{2}$/i.test(part))
    const currency = region && REGION_CURRENCY[region.toUpperCase()]
    if (currency) return currency
  }
  return 'SGD'
}

/** A saved shop's currency; shops saved before currencies existed are SGD. */
export function shopCurrency(shop: { fields: { currency?: string } } | null | undefined): string {
  return shop ? (shop.fields.currency ?? 'SGD') : defaultCurrency()
}

/** Currencies offered when setting up a shop (APAC first). */
export const CURRENCIES = [...new Set(Object.values(REGION_CURRENCY))]

/** Mirrors `backend/app/money.py` — keep both tables in sync. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'])

export function exponent(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2
}

export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** exponent(currency))
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** exponent(currency)
}

/** Prices are stored in minor units (cents/sen; whole units for zero-decimal currencies). */
export function formatPrice(
  minor: number,
  currency: string = defaultCurrency(),
  locale?: string,
): string {
  const digits = exponent(currency)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toMajor(minor, currency))
}

/** The local symbol for a currency, e.g. "$" for SGD in en-SG, "¥" for JPY. */
export function currencySymbol(currency: string = defaultCurrency(), locale?: string): string {
  const part = new Intl.NumberFormat(locale, { style: 'currency', currency })
    .formatToParts(0)
    .find((item) => item.type === 'currency')
  return part?.value ?? currency
}

export function formatDate(seconds: number, locale?: string): string {
  return new Date(seconds * 1000).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
