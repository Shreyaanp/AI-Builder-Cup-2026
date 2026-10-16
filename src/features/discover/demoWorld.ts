import { defaultCurrency } from '../v1/format'

/**
 * Make sure the visitor's ~2 km area has labelled demo shops before searching (hackathon
 * showcase: Chalkboard as it looks at peak use). One request per area per session; never
 * blocks discovery for long, and failures simply leave the real results.
 */
const pending = new Map<string, Promise<void>>()
const cell = (lat: number, lng: number) =>
  `${Math.round(lat * 50) / 50},${Math.round(lng * 50) / 50}`

export function isIndianArea(lat: number, lng: number, place = ''): boolean {
  const p = place.toLowerCase()
  return (
    (lat >= 6.5 && lat <= 37.5 && lng >= 68.0 && lng <= 97.5) ||
    p.includes('india') ||
    p.includes('bengaluru') ||
    p.includes('bangalore') ||
    p.includes('delhi') ||
    p.includes('mumbai') ||
    p.includes('pune') ||
    p.includes('koramangala') ||
    p.includes('indiranagar') ||
    p.includes('chennai') ||
    p.includes('kolkata') ||
    p.includes('hyderabad')
  )
}

export function isSingaporeArea(lat: number, lng: number, place = ''): boolean {
  const p = place.toLowerCase()
  return (
    (lat >= 1.15 && lat <= 1.48 && lng >= 103.6 && lng <= 104.1) ||
    p.includes('singapore') ||
    p.includes('tiong bahru') ||
    p.includes('bugis') ||
    p.includes('katong')
  )
}

export function areaCurrency(lat: number, lng: number, place = ''): string {
  if (isIndianArea(lat, lng, place)) return 'INR'
  if (isSingaporeArea(lat, lng, place)) return 'SGD'
  return defaultCurrency()
}

export function ensureDemoWorld(lat: number, lng: number, place = ''): Promise<void> {
  const key = cell(lat, lng)
  const remembered = `chalkboard.demoWorld.${key}`
  try {
    if (sessionStorage.getItem(remembered)) return Promise.resolve()
  } catch {
    /* Storage is optional. */
  }
  let request = pending.get(key)
  if (!request) {
    const currency = areaCurrency(lat, lng, place)
    const timezone = isIndianArea(lat, lng, place)
      ? 'Asia/Kolkata'
      : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    request = fetch('/api/v1/demo/world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat,
        lng,
        currency,
        timezone,
        place: place.slice(0, 120),
      }),
    })
      .then((response) => {
        if (!response.ok) return
        try {
          sessionStorage.setItem(remembered, '1')
        } catch {
          /* Storage is optional. */
        }
      })
      .catch(() => undefined)
    pending.set(key, request)
  }
  // A first visit may wait for the model; cap the wait so search is never stuck.
  return Promise.race([request, new Promise<void>((resolve) => setTimeout(resolve, 20_000))])
}
