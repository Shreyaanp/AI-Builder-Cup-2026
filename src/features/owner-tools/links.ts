export const PROVIDERS = ['rapido', 'uber', 'porter'] as const
export type RiderProvider = (typeof PROVIDERS)[number]
export const PROVIDER_NAMES = { rapido: 'Rapido', uber: 'Uber', porter: 'Porter' }
export const PROVIDER_HOME = {
  rapido: 'https://www.rapido.bike/',
  uber: 'https://m.uber.com/',
  porter: 'https://porter.in/',
}

export const validUpi = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{1,254}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(value)
export function normalizeAmount(input: string): string | null {
  const value = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  const amount = Number(value)
  return amount > 0 && amount <= 10_000_000 ? amount.toFixed(2) : null
}
export interface PaymentLink {
  amount: string
  note: string
  payee: string
  upi_id: string
  url: string
}
export function paymentLink(
  upi: string,
  name: string,
  amount: string,
  note: string,
): PaymentLink | null {
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
