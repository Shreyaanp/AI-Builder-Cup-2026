/**
 * The shop's region: money, languages, payments, rides, tax and examples, from where it is.
 * One profile per country in regions.json, shared with the backend (backend/app/region.py).
 * An owner's region comes from the shop's pin, a customer's from their area; without one, from
 * the phone (its timezone, then its language region), then from the shop's saved currency.
 */
import data from './regions.json' with { type: 'json' }
import { LOCALES } from '../i18n/locales.ts'
import type { Locale } from '../i18n/locales.ts'

type Raw = (typeof data.regions)['IN']
export type RegionProfile = {
  /** ISO 3166 code; empty for the fallback. */
  country: string
  name: string
  currency: string
  symbol: string
  timezone: string
  centre: [number, number]
  languages: Locale[]
  /** 'upi' (India), 'paynow' (Singapore) or '' (no payment link). */
  paymentRail: '' | 'upi' | 'paynow'
  payments: string[]
  delivery: string[]
  rides: string[]
  tax: string
  askItem: string
  /** A budget for example searches ("chai under ₹30"), in major units. */
  askBudget: number
  /** Rough cost of a cheap coffee or meal, in major units. */
  cheap: number
}

const regions = data.regions as Record<string, Raw>
export const COUNTRY_CURRENCY = data.country_currency as Record<string, string>
const ZONES = data.timezones as Record<string, string>
const CURRENCY_HOME = data.currencies as Record<string, string>
const SYMBOLS = data.symbols as Record<string, string>

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}

function build(country: string, raw: Raw | typeof data.fallback, currency = ''): RegionProfile {
  const money = raw.currency || currency
  return {
    country,
    name: raw.name,
    currency: money,
    symbol: raw.symbol || SYMBOLS[money] || '',
    timezone: raw.timezone,
    centre: [raw.centre[0] ?? 0, raw.centre[1] ?? 0],
    languages: raw.languages.filter(isLocale),
    paymentRail: raw.payment_rail as RegionProfile['paymentRail'],
    payments: raw.payments,
    delivery: raw.delivery,
    rides: raw.rides,
    tax: raw.tax,
    askItem: raw.ask_item,
    askBudget: raw.ask_budget,
    cheap: raw.cheap,
  }
}

/** The profile of a country; the generic fallback (with the country's currency) otherwise. */
export function profile(country: string | null | undefined, currency = ''): RegionProfile {
  const code = (country ?? '').toUpperCase()
  const raw = regions[code]
  if (raw) return build(code, raw)
  return build('', data.fallback, currency || COUNTRY_CURRENCY[code] || 'USD')
}

/** Ray casting on [lat, lng] vertices (fine at country scale). */
function inside(lat: number, lng: number, polygon: number[][]): boolean {
  let found = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [y1 = 0, x1 = 0] = polygon[i] ?? []
    const [y2 = 0, x2 = 0] = polygon[j] ?? []
    if (y1 > lat !== y2 > lat && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) found = !found
  }
  return found
}

/** The country of a point from known bounds (India, Singapore), or null. */
export function countryAt(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  for (const [code, raw] of Object.entries(regions))
    if (raw.bounds.some((polygon) => inside(lat, lng, polygon))) return code
  return null
}

/** The regional language of the area a point is in (Bengaluru → kn), if the app has one. */
export function areaLanguage(lat?: number | null, lng?: number | null): Locale | null {
  const code = countryAt(lat, lng)
  if (!code || lat == null || lng == null) return null
  for (const area of regions[code]?.areas ?? []) {
    const [south = 0, west = 0, north = 0, east = 0] = area.box
    if (lat >= south && lat <= north && lng >= west && lng <= east && isLocale(area.language))
      return area.language
  }
  return null
}

function phoneZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

/** Where the phone is: its timezone first, then the region of its languages (en-IN → IN). */
export function phoneCountry(
  languages: readonly string[] = navigator.languages ?? [],
  zone: string = phoneZone(),
): string | null {
  const fromZone = ZONES[zone]
  if (fromZone) return fromZone
  for (const tag of languages) {
    const region = tag.split('-').find((part, index) => index > 0 && /^[A-Z]{2}$/i.test(part))
    if (region && COUNTRY_CURRENCY[region.toUpperCase()]) return region.toUpperCase()
  }
  return null
}

/** A customer's region from their area; the phone's when the area is unknown. */
export function regionAt(lat?: number | null, lng?: number | null): RegionProfile {
  return profile(countryAt(lat, lng) ?? phoneCountry())
}

type ShopFields = {
  lat?: number | null
  lng?: number | null
  timezone?: string | null
  currency?: string | null
}

/** A shop's region: its pin, then its timezone, then its currency, then the phone. */
export function shopRegion(fields: ShopFields | null | undefined): RegionProfile {
  const currency = fields?.currency ?? ''
  const code =
    countryAt(fields?.lat, fields?.lng) ??
    ZONES[fields?.timezone ?? ''] ??
    CURRENCY_HOME[currency] ??
    phoneCountry()
  return profile(code, currency)
}

/** The shop's saved timezone; its region's when none is stored (older Singapore shops). */
export function shopZone(fields: ShopFields | null | undefined): string {
  if (fields?.timezone) return fields.timezone
  const region = shopRegion(fields)
  return region.country ? region.timezone : phoneZone() || 'UTC'
}

/** Where a customer's map starts before they share a location: the phone's region's sample
 * area (Indiranagar for an Indian phone), never Singapore for India. */
export function phoneArea(): { lat: number; lng: number; label: string } {
  return countryArea(phoneCountry() ?? '')
}

/** A country's sample area, at its own coordinates (Indiranagar is Indiranagar, not the city
 * centre 5 km away, whose radius would miss the area's shops). */
export function countryArea(country: string): { lat: number; lng: number; label: string } {
  const raw = regions[country] ?? data.fallback
  return { lat: raw.area.point[0] ?? 0, lng: raw.area.point[1] ?? 0, label: raw.area.label }
}

/** The currency a payment rail takes (UPI and PayNow each have their region's), or ''. */
export function railCurrency(rail: RegionProfile['paymentRail']): string {
  if (!rail) return ''
  return Object.values(regions).find((raw) => raw.payment_rail === rail)?.currency ?? ''
}

/** The symbol people read for a currency (S$, ₹, RM…), or undefined to use Intl's. */
export function currencyMark(currency: string): string | undefined {
  return SYMBOLS[currency.toUpperCase()]
}

/**
 * The tag for formatting money: the app language with the currency's home country, so rupees
 * always group as 1,00,000 and dollars as 100,000 whatever the app language (ta-SG, hi-IN).
 */
export function moneyLocale(currency: string, locale?: string): string | undefined {
  const home = CURRENCY_HOME[currency.toUpperCase()]
  const language = (locale ?? '').split('-').filter((part) => !/^[A-Z]{2}$/.test(part))
  if (!home) return locale
  const tag = [...(language.length ? language : ['en']), home].join('-')
  try {
    return Intl.NumberFormat.supportedLocalesOf([tag]).length ? tag : `en-${home}`
  } catch {
    return locale
  }
}

/**
 * The languages offered after sign-in, best guess first: the phone's own language when the
 * region speaks it, else the area's regional language (Bengaluru → Kannada), else the region's
 * first (India → Hindi, Singapore → English). English is always offered.
 */
export function languageChoices(
  region: RegionProfile,
  point?: { lat?: number | null; lng?: number | null } | null,
  phone: readonly string[] = navigator.languages ?? [],
): { suggested: Locale; offered: Locale[] } {
  const spoken = phone
    .map((tag) => {
      const base = tag.toLowerCase().split('-')[0] ?? ''
      return base === 'zh' ? 'zh-Hans' : base
    })
    .filter(isLocale)
  const regional = areaLanguage(point?.lat, point?.lng)
  const own = spoken.find((code) => code !== 'en' && region.languages.includes(code))
  const fallback = region.languages[0] ?? 'en'
  const suggested: Locale =
    own ??
    (regional && region.languages.includes(regional) ? regional : null) ??
    (region.country ? fallback : (spoken[0] ?? 'en'))
  const offered = [
    ...new Set<Locale>([
      suggested,
      ...(regional ? [regional] : []),
      ...region.languages,
      ...(region.country ? [] : spoken),
      'en',
    ]),
  ]
  return { suggested, offered }
}
