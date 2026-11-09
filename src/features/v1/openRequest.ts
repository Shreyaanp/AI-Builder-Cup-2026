/**
 * A screen the coach asked to open inside the tab it switches to (open_screen "radar" opens
 * Asked nearby on Grow, "rider" opens Send a rider on Payments, "plan" opens How much to make
 * with the numbers open, "make" opens the same list on its own (Home's chip, OB-328), "supply"
 * opens Buy stock). The tab reads it when it mounts and clears it once shown, so Back and later
 * visits open the plain tab.
 */
export type OpenRequest = 'radar' | 'rider' | 'plan' | 'make' | 'stock'
let pending: OpenRequest | null = null

export function requestOpen(target: OpenRequest) {
  pending = target
}

/** True while `target` waits to be shown; call clearOpen() after showing it. */
export function wantsOpen(target: OpenRequest): boolean {
  return pending === target
}

export function clearOpen(target: OpenRequest) {
  if (pending === target) pending = null
}
