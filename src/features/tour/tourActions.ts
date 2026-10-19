import type { useWorkspace } from '../v1/workspaceContext'
import { tour } from './tourStore'

/**
 * Start the guided tour. Signed-in owners go straight to the public demo, which is ready at once
 * and leaves no demo data in their account; inside the demo the tour runs on its sandbox shop.
 */
export async function startDemoTour(
  ws: ReturnType<typeof useWorkspace>,
  setBusy: (busy: boolean) => void = () => undefined,
  setFailed: (failed: boolean) => void = () => undefined,
) {
  if (!window.location.pathname.startsWith('/demo')) {
    window.location.assign('/demo?tour=1')
    return false
  }
  setBusy(true)
  setFailed(false)
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
    const made = await ws.api<{ business_id: string }>(
      `/demo/workspace?zone=${encodeURIComponent(zone)}`,
      { method: 'POST', signal: AbortSignal.timeout(60_000) },
    )
    await ws.reload()
    ws.select(made.business_id)
    ws.cancelNewShop()
    ws.dismissNewShopReady()
    ws.go('coach')
    tour.start()
    return true
  } catch {
    setFailed(true)
    return false
  } finally {
    setBusy(false)
  }
}
