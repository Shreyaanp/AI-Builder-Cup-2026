import {
  COUNTRY_CURRENCY,
  currencyMark,
  moneyLocale,
  phoneCountry,
  shopRegion,
} from '../../region/region.ts'

/**
 * Default currency for a new shop, from the phone: its timezone first (Asia/Kolkata → INR, even
 * with an en-US phone language), then its language region (en-IN → INR), then USD.
 */
export function defaultCurrency(
  languages: readonly string[] = navigator.languages ?? [],
  zone?: string,
): string {
  return COUNTRY_CURRENCY[phoneCountry(languages, zone) ?? ''] ?? 'USD'
}

/** Currency for a place / area, from its coordinates when known, otherwise the phone default. */
export function areaCurrency(
  place?: { lat?: number | null; lng?: number | null } | null,
  languages?: readonly string[],
  zone?: string,
): string {
  if (place && place.lat != null && place.lng != null) {
    const { lat, lng } = place
    // Singapore
    if (lat > 1.15 && lat < 1.48 && lng > 103.6 && lng < 104.1) return 'SGD'
    // India
    if (lat >= 6.5 && lat <= 37.5 && lng >= 68.0 && lng <= 97.5) return 'INR'
    // Malaysia
    if (lat >= 1.0 && lat <= 7.5 && lng >= 99.5 && lng <= 120.0) return 'MYR'
    // Japan
    if (lat >= 24.0 && lat <= 46.0 && lng >= 122.0 && lng <= 154.0) return 'JPY'
    // South Korea
    if (lat >= 33.0 && lat <= 39.0 && lng >= 124.0 && lng <= 132.0) return 'KRW'
    // Indonesia
    if (lat >= -11.0 && lat <= 6.0 && lng >= 95.0 && lng <= 141.0) return 'IDR'
    // Thailand
    if (lat >= 5.5 && lat <= 20.5 && lng >= 97.0 && lng <= 106.0) return 'THB'
    // Vietnam
    if (lat >= 8.5 && lat <= 23.5 && lng >= 102.0 && lng <= 110.0) return 'VND'
    // Philippines
    if (lat >= 4.5 && lat <= 21.5 && lng >= 116.0 && lng <= 127.0) return 'PHP'
    // UK
    if (lat >= 49.0 && lat <= 61.0 && lng >= -8.0 && lng <= 2.0) return 'GBP'
    // Australia
    if (lat >= -44.0 && lat <= -10.0 && lng >= 112.0 && lng <= 154.0) return 'AUD'
  }
  return defaultCurrency(languages, zone)
}

/** A saved shop's currency; for one without (older shops, drafts), its region's. */
export function shopCurrency(
  shop:
    | { fields: { currency?: string; lat?: number | null; lng?: number | null; timezone?: string } }
    | null
    | undefined,
): string {
  return shop ? shop.fields.currency || shopRegion(shop.fields).currency : defaultCurrency()
}

/** Every country's currency, sorted; the editor puts the shop's own first. */
export const CURRENCIES = [...new Set(Object.values(COUNTRY_CURRENCY))].sort()

/** Mirrors `backend/app/money.py` — keep both tables in sync. */
const ZERO_DECIMAL = new Set([
  'JPY',
  'KRW',
  'VND',
  'IDR',
  'CLP',
  'ISK',
  'UGX',
  'XAF',
  'XOF',
  'BIF',
  'DJF',
  'GNF',
  'KMF',
  'PYG',
  'RWF',
  'VUV',
  'XPF',
])
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

export function exponent(currency: string): number {
  const code = currency.toUpperCase()
  return ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMAL.has(code) ? 3 : 2
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
  // The currency's home grouping (₹1,00,000) and the symbol people read there (S$, not $).
  const mark = currencyMark(currency)
  return new Intl.NumberFormat(moneyLocale(currency, locale ?? appLanguage()), {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .formatToParts(toMajor(minor, currency))
    .map((part) => (part.type === 'currency' && mark ? mark : part.value))
    .join('')
}

/** The page language (set from the app's language preference) when no locale is passed. */
function appLanguage(): string | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined
}

/** A round amount in major units ("S$3", "₹30"): no decimals when the amount is whole. */
export function formatAmount(major: number, currency: string, locale?: string): string {
  if (!Number.isInteger(major)) return formatPrice(toMinor(major, currency), currency, locale)
  const mark = currencyMark(currency)
  return new Intl.NumberFormat(moneyLocale(currency, locale ?? appLanguage()), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  })
    .formatToParts(major)
    .map((part) => (part.type === 'currency' && mark ? mark : part.value))
    .join('')
}

/** The local symbol for a currency, e.g. "S$" for SGD, "¥" for JPY, "¥" for JPY. */
export function currencySymbol(currency: string = defaultCurrency(), locale?: string): string {
  const mark = currencyMark(currency)
  if (mark) return mark
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
