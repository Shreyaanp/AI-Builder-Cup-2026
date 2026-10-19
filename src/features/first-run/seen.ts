export type Audience = 'owner' | 'customer'
const key = (app: Audience) => `chalkboard.explainer.${app}.v1`
export function hasSeen(app: Audience, storage?: Pick<Storage, 'getItem'>) {
  try {
    return (
      (storage ?? localStorage).getItem(key(app)) === '1' ||
      (!storage && document.cookie.split('; ').includes(`${key(app)}=1`))
    )
  } catch {
    /* The device marker can still work when local storage is unavailable. */
  }
  try {
    return !storage && document.cookie.split('; ').includes(`${key(app)}=1`)
  } catch {
    return false
  }
}

/** Keep only this nonpersonal device marker when account storage is erased. */
export function preserveSeen(app: Audience) {
  try {
    document.cookie = `${key(app)}=1; Path=/; Max-Age=315360000; SameSite=Lax`
  } catch {
    /* Local storage remains the primary marker when cookies are blocked. */
  }
}
export function remember(app: Audience, storage?: Pick<Storage, 'setItem'>) {
  try {
    ;(storage ?? localStorage).setItem(key(app), '1')
  } catch {
    /* This visit still continues. */
  }
  if (!storage) preserveSeen(app)
}
