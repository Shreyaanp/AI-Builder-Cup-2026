import { viewTransition } from '../frontdoors/navigation'

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function chatPath(shop: string, thread: string) {
  return `/explore/chats/${encodeURIComponent(shop)}/${encodeURIComponent(thread)}`
}

/** Go to a path with the shared-element transition the rest of the customer app uses. */
export function go(path: string) {
  const update = () => {
    history.pushState({}, '', path)
    dispatchEvent(new PopStateEvent('popstate'))
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  viewTransition(update)
}
