import { defaultCurrency } from '../v1/format'

/**
 * Make sure the visitor's ~2 km area has labelled demo shops before searching (hackathon
 * showcase: Chalkboard as it looks at peak use). One request per area per session; never
 * blocks discovery for long, and failures simply leave the real results.
 */
const pending = new Map<string, Promise<void>>()
const cell = (lat: number, lng: number) =>
  `${Math.round(lat * 50) / 50},${Math.round(lng * 50) / 50}`

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
    request = fetch('/api/v1/demo/world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat,
        lng,
        currency: defaultCurrency(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
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
