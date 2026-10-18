import type { AppSide } from './appSide'

export type FarewellReason = 'signed-out' | 'deleted'

const key = (side: AppSide) => `chalkboard.${side}.farewell`

/** Left for the next page after the session's own data is gone; nonpersonal. */
export function leaveFarewell(side: AppSide, reason: FarewellReason) {
  try {
    sessionStorage.setItem(key(side), reason)
  } catch {
    /* The front door still opens signed out. */
  }
}

export function readFarewell(side: AppSide): FarewellReason | null {
  try {
    const value = sessionStorage.getItem(key(side))
    return value === 'signed-out' || value === 'deleted' ? value : null
  } catch {
    return null
  }
}

export function forgetFarewell(side: AppSide) {
  try {
    sessionStorage.removeItem(key(side))
  } catch {
    /* Shown once for this page either way. */
  }
}
