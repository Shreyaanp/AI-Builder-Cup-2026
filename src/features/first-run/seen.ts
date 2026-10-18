export type Audience = 'owner' | 'customer'
const key = (app: Audience) => `chalkboard.explainer.${app}.v1`
export function hasSeen(app: Audience, storage?: Pick<Storage, 'getItem'>) {
  try {
    return (storage ?? localStorage).getItem(key(app)) === '1'
  } catch {
    return false
  }
}
export function remember(app: Audience, storage?: Pick<Storage, 'setItem'>) {
  try {
    ;(storage ?? localStorage).setItem(key(app), '1')
  } catch {
    /* This visit still continues. */
  }
}
