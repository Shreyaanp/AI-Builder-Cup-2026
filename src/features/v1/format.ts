/** Currency for every country (ISO 3166 → ISO 4217, from CLDR). Works worldwide. */
const REGION_CURRENCY: Record<string, string> = Object.fromEntries(
  (
    'AD:EUR AE:AED AF:AFN AG:XCD AL:ALL AM:AMD AO:AOA AR:ARS AT:EUR AU:AUD AZ:AZN BA:BAM BB:BBD ' +
    'BD:BDT BE:EUR BF:XOF BG:BGN BH:BHD BI:BIF BJ:XOF BN:BND BO:BOB BR:BRL BS:BSD BT:BTN BW:BWP ' +
    'BY:BYN BZ:BZD CA:CAD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CL:CLP CM:XAF CN:CNY CO:COP CR:CRC ' +
    'CU:CUP CV:CVE CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP ' +
    'ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FR:EUR GA:XAF GB:GBP GD:XCD GE:GEL GH:GHS GM:GMD GN:GNF ' +
    'GQ:XAF GR:EUR GT:GTQ GW:XOF GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS ' +
    'IN:INR IQ:IQD IR:IRR IS:ISK IT:EUR JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KM:KMF KN:XCD ' +
    'KR:KRW KW:KWD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR ' +
    'LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR MG:MGA MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MR:MRU MT:EUR ' +
    'MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN NA:NAD NE:XOF NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR ' +
    'NZ:NZD OM:OMR PA:PAB PE:PEN PG:PGK PH:PHP PK:PKR PL:PLN PT:EUR PY:PYG QA:QAR RO:RON RS:RSD ' +
    'RU:RUB RW:RWF SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SI:EUR SK:EUR SL:SLE SN:XOF SO:SOS ' +
    'SR:SRD SS:SSP SV:USD SY:SYP SZ:SZL TD:XAF TG:XOF TH:THB TJ:TJS TL:USD TM:TMT TN:TND TO:TOP ' +
    'TR:TRY TT:TTD TW:TWD TZ:TZS UA:UAH UG:UGX US:USD UY:UYU UZ:UZS VE:VES VN:VND VU:VUV WS:WST ' +
    'YE:YER ZA:ZAR ZM:ZMW ZW:ZWG PR:USD GU:USD'
  )
    .split(' ')
    .map((pair) => pair.split(':') as [string, string]),
)

/** Where the phone is set (its timezone) says more about the shop than its language does. */
const ZONE_REGION: Record<string, string> = {
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Jakarta': 'ID',
  'Asia/Makassar': 'ID',
  'Asia/Jayapura': 'ID',
  'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Saigon': 'VN',
  'Asia/Manila': 'PH',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Taipei': 'TW',
  'Asia/Dhaka': 'BD',
  'Asia/Karachi': 'PK',
  'Asia/Colombo': 'LK',
  'Asia/Kathmandu': 'NP',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Qatar': 'QA',
  'Asia/Kuwait': 'KW',
  'Asia/Yangon': 'MM',
  'Asia/Phnom_Penh': 'KH',
  'Asia/Jerusalem': 'IL',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Warsaw': 'PL',
  'Europe/Istanbul': 'TR',
  'Europe/Moscow': 'RU',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'Africa/Cairo': 'EG',
  'Africa/Johannesburg': 'ZA',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Bogota': 'CO',
  'America/Lima': 'PE',
  'America/Santiago': 'CL',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Brisbane': 'AU',
  'Pacific/Auckland': 'NZ',
}

function phoneZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

/**
 * Default currency for a new shop, from the phone: its timezone first (Asia/Kolkata → INR, even
 * with an en-US phone language), then its language region (en-IN → INR), then USD.
 */
export function defaultCurrency(
  languages: readonly string[] = navigator.languages ?? [],
  zone: string = phoneZone(),
): string {
  const fromZone = REGION_CURRENCY[ZONE_REGION[zone] ?? '']
  if (fromZone) return fromZone
  for (const tag of languages) {
    const region = tag.split('-').find((part, index) => index > 0 && /^[A-Z]{2}$/i.test(part))
    const currency = region && REGION_CURRENCY[region.toUpperCase()]
    if (currency) return currency
  }
  return 'USD'
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

/** A saved shop's currency; shops saved before currencies existed are SGD. */
export function shopCurrency(shop: { fields: { currency?: string } } | null | undefined): string {
  return shop ? (shop.fields.currency ?? 'SGD') : defaultCurrency()
}

/** Every country's currency, sorted; the editor puts the shop's own first. */
export const CURRENCIES = [...new Set(Object.values(REGION_CURRENCY))].sort()

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

const INDIC_LOCALES = new Set([
  'en-IN',
  'hi',
  'ta',
  'te',
  'kn',
  'bn',
  'mr',
  'hi-IN',
  'ta-IN',
  'te-IN',
  'kn-IN',
  'bn-IN',
  'mr-IN',
])

/** Prices are stored in minor units (cents/sen; whole units for zero-decimal currencies). */
export function formatPrice(
  minor: number,
  currency: string = defaultCurrency(),
  locale?: string,
): string {
  const digits = exponent(currency)
  const isIndic =
    currency === 'INR' ||
    (locale != null && (INDIC_LOCALES.has(locale) || INDIC_LOCALES.has(locale.split('-')[0] ?? '')))
  const formatLocale = isIndic ? 'en-IN' : locale
  return new Intl.NumberFormat(formatLocale, {
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
