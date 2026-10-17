/**
 * Shops this person opened, on this device only: a personal signal for search and Today's 7.
 * It is sent with their own requests and never stored on the server.
 */
const KEY = 'chalkboard.search.opened'
const MAX = 30

export function openedShops(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (Array.isArray(value))
      return value.filter((id): id is string => typeof id === 'string').slice(0, MAX)
  } catch {
    /* Optional storage. */
  }
  return []
}

export function rememberOpened(id: string) {
  try {
    const next = [id, ...openedShops().filter((other) => other !== id)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* Optional storage. */
  }
}

export function forgetOpened() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* Optional storage. */
  }
}
