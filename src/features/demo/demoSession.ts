export type Session = { session_id: string; expires_at: number }
const SESSION_KEY = 'chalkboard.demo.session'
/** Set while the customer demo's steps are on screen: they open the real shop page and Passport. */
const TOUR_KEY = 'chalkboard.demo.customer-tour'

/** This tab's demo sandbox, while it has at least a minute left. */
export function savedSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
    return value && value.expires_at * 1000 - Date.now() > 60_000 ? value : null
  } catch {
    return null
  }
}
export function rememberSession(value: Session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value))
  } catch {
    /* Without storage the next page simply opens a new sandbox. */
  }
}
/** Forgets the stored sandbox, unless a newer one has replaced it since this one ended. */
export function forgetSession(id?: string) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
    if (id && stored?.session_id !== id && stored) return
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* Nothing was stored. */
  }
}

/** The customer demo is open in this tab (set by the demo, cleared by Exit demo). */
export function setCustomerTour(on: boolean) {
  try {
    if (on) sessionStorage.setItem(TOUR_KEY, '1')
    else sessionStorage.removeItem(TOUR_KEY)
  } catch {
    /* Without storage the steps simply open without the banner. */
  }
}
export function inCustomerTour(): boolean {
  try {
    return sessionStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return false
  }
}

/** Ends the demo: drops this tab's sandbox, then opens the real app (or the landing page). */
export async function exitDemo(session: Session | null, destination: string) {
  forgetSession(session?.session_id)
  setCustomerTour(false)
  try {
    if (session)
      await fetch(`/api/v1/demo/sessions/${session.session_id}`, {
        method: 'DELETE',
        credentials: 'omit',
        signal: AbortSignal.timeout(5000),
      })
  } catch {
    // An unreachable server must not trap the visitor; the fixture also expires on its own.
  } finally {
    location.assign(destination)
  }
}
