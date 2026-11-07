/**
 * The app configuration (`/api/v1/bootstrap`), read once per page and shared by every caller.
 *
 * A-4: each page load used to read it two or three times (account, analytics, maps), so many
 * phones on one IP reached the per-IP limit quickly. A-5: a refused or failed read is tried
 * again (honouring Retry-After, within a short budget) before callers see a failure; a failure
 * is not cached, so a later call tries again.
 */
export type BootstrapConfig = {
  auth_mode?: string
  firebase?: Record<string, string>
  features?: { guest_customer?: boolean; google_guide?: boolean }
  ga_measurement_id?: string
  maps_browser_key?: string
  maps_mode?: string
  [key: string]: unknown
}

export class BootstrapError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`bootstrap ${status}`)
    this.status = status
  }
}

const WAITS_MS = [600, 1_800, 4_000]
const MAX_WAIT_MS = 5_000
let shared: Promise<BootstrapConfig> | null = null

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryAfter(response: Response, fallback: number) {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_WAIT_MS) : fallback
}

async function read(): Promise<BootstrapConfig> {
  for (let attempt = 0; ; attempt += 1) {
    const last = attempt >= WAITS_MS.length
    const pause = WAITS_MS[attempt] ?? 0
    let response: Response
    try {
      response = await fetch('/api/v1/bootstrap', {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      // Offline or timed out: try again, then give up.
      if (last) throw new BootstrapError(0)
      await wait(pause)
      continue
    }
    if (response.ok) {
      const value: unknown = await response.json().catch(() => null)
      if (!value || typeof value !== 'object' || !('auth_mode' in value))
        throw new BootstrapError(response.status)
      return value as BootstrapConfig
    }
    // Busy (429) or a server error is worth another try; anything else is final.
    if (last || (response.status !== 429 && response.status < 500))
      throw new BootstrapError(response.status)
    await wait(retryAfter(response, pause))
  }
}

export function loadBootstrap(): Promise<BootstrapConfig> {
  shared ??= read().catch((error: unknown) => {
    shared = null
    throw error
  })
  return shared
}
