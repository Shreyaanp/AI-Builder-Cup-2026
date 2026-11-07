import type { AppSide } from './appSide'

/**
 * `deleted`: the owner's account. `data-deleted`: the customer's "Delete my data" (their Google
 * sign-in itself stays); `data-deleted-signed-in`: the same, but the sign-out did not finish.
 */
const reasons = ['signed-out', 'deleted', 'data-deleted', 'data-deleted-signed-in'] as const
export type FarewellReason = (typeof reasons)[number]

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
    return (reasons as readonly (string | null)[]).includes(value)
      ? (value as FarewellReason)
      : null
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
