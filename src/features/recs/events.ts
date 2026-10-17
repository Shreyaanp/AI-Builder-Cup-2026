import { deviceId } from '../rewards/storage'

/**
 * Real customer actions for Recommendations AI (backend `recs_routes.py`). Fire-and-forget: the
 * server hashes the anonymous device id, checks the shop and item exist, and batches. While the
 * server switch is off it answers `enabled: false` and this stops sending for the session.
 */
type RecsEvent =
  | { kind: 'shop_open'; shop_id: string }
  | { kind: 'item_open' | 'remind'; shop_id: string; item: { name: string; unit: string } }
  | { kind: 'ask'; query: string }

let enabled = true

export function recsEvent(event: RecsEvent) {
  if (!enabled) return
  let visitor: string
  try {
    visitor = deviceId()
  } catch {
    return
  }
  void fetch('/api/v1/public/recs/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ ...event, visitor }),
  })
    .then(async (response) => {
      if (!response.ok) return
      const receipt = (await response.json()) as { enabled?: boolean }
      if (receipt.enabled === false) enabled = false
    })
    .catch(() => {
      /* Recommendations are optional; never surface this to customers. */
    })
}
