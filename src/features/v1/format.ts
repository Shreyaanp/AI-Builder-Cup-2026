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

/** Prices are stored in minor units (cents/sen/paise; whole units for zero-decimal currencies). */
export function formatPrice(
  minor: number,
  currency: string = defaultCurrency(),
  locale?: string,
): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency })
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2
  return format.format(minor / 10 ** digits)
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
