// Only a UI dismissal date, per account/shop, in this tab. No shop facts or credentials.
const dates = new Map<string, string>()
const event = 'chalkboard:freshness-dismissed'
export function readDismissal(key: string) {
  try {
    return sessionStorage.getItem(key) ?? dates.get(key) ?? null
  } catch {
    return dates.get(key) ?? null
  }
}
export function dismissFreshness(key: string, day: string) {
  dates.set(key, day)
  try {
    sessionStorage.setItem(key, day)
  } catch {
    /* This visit still works without storage. */
  }
  window.dispatchEvent(new Event(event))
}
export function subscribeDismissal(listener: () => void) {
  window.addEventListener(event, listener)
  return () => window.removeEventListener(event, listener)
}
