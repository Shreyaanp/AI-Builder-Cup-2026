import type { AskPick } from './askThread'
import { isIndianArea } from './demoWorld'

const cache = new Map<string, AskPick[]>()
const inFlight = new Map<string, Promise<AskPick[]>>()

const cellKey = (lat: number, lng: number) =>
  `${Math.round(lat * 50) / 50},${Math.round(lng * 50) / 50}`

const STOP = new Set(
  // Same words as the server's STOP list (backend/app/discover_ask.py).
  "a an the i im i'm me my we want need looking for find some any near nearby around here please today now open cheap cheapest budget good best place places shop shops store under below less than with without and or to of in at on get buy something where what which who how can could is are there do does sell sells have has rupee rupees rs inr dollar dollars".split(
    ' ',
  ),
)

export function getCachedShops(lat: number, lng: number): AskPick[] {
  const key = cellKey(lat, lng)
  return cache.get(key) ?? []
}

export function saveCachedShops(lat: number, lng: number, shops: AskPick[]): void {
  const key = cellKey(lat, lng)
  cache.set(key, shops)
  try {
    sessionStorage.setItem(`chalkboard.shopCache.${key}`, JSON.stringify(shops.slice(0, 30)))
  } catch {
    /* Optional session storage */
  }
}

export function loadCachedShops(lat: number, lng: number): AskPick[] {
  const key = cellKey(lat, lng)
  if (cache.has(key)) return cache.get(key)!
  try {
    const raw = sessionStorage.getItem(`chalkboard.shopCache.${key}`)
    if (raw) {
      const parsed = JSON.parse(raw) as AskPick[]
      if (Array.isArray(parsed)) {
        cache.set(key, parsed)
        return parsed
      }
    }
  } catch {
    /* Optional storage */
  }
  return []
}

export async function prefetchAreaShops(lat: number, lng: number): Promise<AskPick[]> {
  const key = cellKey(lat, lng)
  const existing = cache.get(key)
  if (existing && existing.length > 0) return existing

  const loaded = loadCachedShops(lat, lng)
  if (loaded.length > 0) return loaded

  let pending = inFlight.get(key)
  if (!pending) {
    pending = fetch(`/api/v1/discover?lat=${lat}&lng=${lng}&radius=4000`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { places?: AskPick[] } | null) => {
        const places = (data?.places ?? []).map((p) => ({
          ...p,
          matched: p.matched ?? (p.items ? p.items.slice(0, 3) : []),
        }))
        saveCachedShops(lat, lng, places)
        return places
      })
      .catch(() => [])
      .finally(() => inFlight.delete(key))
    inFlight.set(key, pending)
  }
  return pending
}

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      // A number is a budget ("under 30"), never a word to match.
      .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w))
  )
}

export function localRankShops(q: string, lat: number, lng: number): AskPick[] {
  const shops = getCachedShops(lat, lng)
  if (!shops.length) return []

  const words = tokenize(q)
  if (!words.length) return []

  const results: AskPick[] = []
  // Same rules as the server: one currency per area, one card per shop ("(Tour)"/"(Demo)").
  const inIndia = isIndianArea(lat, lng)
  const seen = new Set<string>()

  for (const shop of shops) {
    if (inIndia && shop.currency === 'SGD') continue
    const nameKey = shop.name
      .replace(/\s*\((Tour|Demo)\)$/i, '')
      .trim()
      .toLowerCase()
    if (seen.has(nameKey)) continue
    const shopText = `${shop.name} ${shop.category}`.toLowerCase()
    const nameHit = words.some((w) => shopText.includes(w))

    const matchedItems = (shop.items ?? []).filter((item) => {
      const itemText = (item.name || '').toLowerCase()
      return words.some((w) => itemText.includes(w) || w.includes(itemText))
    })

    if (!nameHit && !matchedItems.length) continue
    seen.add(nameKey)

    const distance = shop.distance_m ?? 500
    const score =
      matchedItems.length * 3 + (nameHit ? 2 : 0) + (shop.open_now ? 1 : 0) - distance / 1500

    results.push({
      ...shop,
      matched: matchedItems.length ? matchedItems : (shop.items?.slice(0, 3) ?? []),
      score,
    })
  }

  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  return results
}
