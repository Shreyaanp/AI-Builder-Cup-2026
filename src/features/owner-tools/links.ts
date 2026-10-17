/** Every ride and parcel app; a shop is offered its region's (India: Rapido, Uber, Porter;
 * Singapore: Grab, Gojek, Lalamove). */
export const PROVIDERS = ['rapido', 'uber', 'porter', 'grab', 'gojek', 'lalamove'] as const
export type RiderProvider = (typeof PROVIDERS)[number]
export const PROVIDER_NAMES: Record<RiderProvider, string> = {
  rapido: 'Rapido',
  uber: 'Uber',
  porter: 'Porter',
  grab: 'Grab',
  gojek: 'Gojek',
  lalamove: 'Lalamove',
}
export const PROVIDER_HOME: Record<RiderProvider, string> = {
  rapido: 'https://www.rapido.bike/',
  uber: 'https://m.uber.com/',
  porter: 'https://porter.in/',
  grab: 'https://www.grab.com/sg/transport/',
  gojek: 'https://www.gojek.com/sg/',
  lalamove: 'https://www.lalamove.com/en-sg/',
}

function isProvider(value: string): value is RiderProvider {
  return (PROVIDERS as readonly string[]).includes(value)
}

/** The ride apps this shop shows: the owner's choice, else its region's (region.ts rides). */
export function shopProviders(
  saved: readonly string[] | null | undefined,
  region: { rides: readonly string[] },
): RiderProvider[] {
  return (saved ?? region.rides).filter(isProvider)
}

export const validUpi = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{1,254}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(value)
export function normalizeAmount(input: string): string | null {
  const value = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  const amount = Number(value)
  return amount > 0 && amount <= 10_000_000 ? amount.toFixed(2) : null
}
/** A payment card: a UPI link (India) or a PayNow QR (Singapore); see backend/app/payments.py. */
export type UpiLink = {
  rail?: 'upi'
  amount: string
  note: string
  payee: string
  upi_id: string
  url: string
}
export type PaynowLink = {
  rail: 'paynow'
  currency: 'SGD'
  amount: string
  note: string
  payee: string
  paynow_id: string
  payload: string
}
export type PaymentLink = UpiLink | PaynowLink
/** A +65 mobile number or a business UEN (mirrors backend/app/merchant.py). */
export const validPaynow = (value: string) =>
  /^(?:\+65[3689]\d{7}|\d{8,9}[A-Z]|[TSR]\d{2}[A-Z]{2}\d{4}[A-Z])$/.test(value)

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`
}
/** CRC-16/CCITT-FALSE over the UTF-8 bytes, as EMVCo QR codes end with. */
function crc16(data: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(data)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}
const plain = (text: string, limit: number) =>
  text
    .replace(/[^ -~]/g, '')
    .trim()
    .slice(0, limit) || '-'

/** The SGQR / PayNow payload for a fixed amount to a +65 mobile number or a UEN. */
export function paynowPayload(proxy: string, payee: string, amount: string, note = ''): string {
  const account =
    tlv('00', 'SG.PAYNOW') +
    tlv('01', proxy.startsWith('+65') ? '0' : '2') +
    tlv('02', proxy) +
    tlv('03', '0')
  const body =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('26', account) +
    tlv('52', '0000') +
    tlv('53', '702') +
    tlv('54', amount) +
    tlv('58', 'SG') +
    tlv('59', plain(payee, 25)) +
    tlv('60', 'Singapore') +
    (note.trim() ? tlv('62', tlv('01', plain(note, 25))) : '') +
    '6304'
  return body + crc16(body)
}

export function paynowLink(
  proxy: string,
  name: string,
  amount: string,
  note: string,
): PaynowLink | null {
  const normalized = normalizeAmount(amount)
  if (
    !validPaynow(proxy.trim()) ||
    !name.trim() ||
    !normalized ||
    note.length > 80 ||
    [...note].some((char) => char.charCodeAt(0) < 32)
  )
    return null
  return {
    rail: 'paynow',
    currency: 'SGD',
    amount: normalized,
    note: note.trim(),
    payee: name.trim(),
    paynow_id: proxy.trim(),
    payload: paynowPayload(proxy.trim(), name.trim(), normalized, note.trim()),
  }
}

/** Rebuild a card from its validated fields; never trust a model-supplied URL or payload. */
export function checkedPayment(payment: PaymentLink): PaymentLink | null {
  return payment.rail === 'paynow'
    ? paynowLink(payment.paynow_id, payment.payee, payment.amount, payment.note)
    : paymentLink(payment.upi_id, payment.payee, payment.amount, payment.note)
}
export function paymentLink(
  upi: string,
  name: string,
  amount: string,
  note: string,
): UpiLink | null {
  const normalized = normalizeAmount(amount)
  if (
    !validUpi(upi.trim()) ||
    !name.trim() ||
    !normalized ||
    note.length > 80 ||
    [...note].some((char) => char.charCodeAt(0) < 32)
  )
    return null
  const params = new URLSearchParams({
    pa: upi.trim(),
    pn: name.trim(),
    am: normalized,
    cu: 'INR',
    tn: note.trim(),
  })
  return {
    rail: 'upi',
    amount: normalized,
    note: note.trim(),
    payee: name.trim(),
    upi_id: upi.trim(),
    url: `upi://pay?${params}`,
  }
}
export type Pin = { lat: number; lng: number; name: string }
export function validPin(pin: Pin | null): pin is Pin {
  return (
    pin !== null &&
    Number.isFinite(pin.lat) &&
    Number.isFinite(pin.lng) &&
    Math.abs(pin.lat) <= 90 &&
    Math.abs(pin.lng) <= 180
  )
}

/** Uber's universal link handles app/web. Rapido and Porter have no supported public
 * address-prefill contract here: their home is the deliberate fallback, not a fake booking. */
export function riderLink(provider: RiderProvider, pickup: Pin, drop: string): string {
  if (!validPin(pickup) || !drop.trim()) return PROVIDER_HOME[provider]
  if (provider !== 'uber') return PROVIDER_HOME[provider]
  const params = new URLSearchParams({
    action: 'setPickup',
    'pickup[latitude]': String(pickup.lat),
    'pickup[longitude]': String(pickup.lng),
    'pickup[nickname]': pickup.name,
  })
  const point = drop.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  const destination = point ? { lat: Number(point[1]), lng: Number(point[2]), name: '' } : null
  if (validPin(destination)) {
    params.set('dropoff[latitude]', String(destination.lat))
    params.set('dropoff[longitude]', String(destination.lng))
  } else params.set('dropoff[formatted_address]', drop.trim())
  return `https://m.uber.com/ul/?${params}`
}
