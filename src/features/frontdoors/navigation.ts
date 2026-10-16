import type { MouseEvent } from 'react'

export function subscribePath(listener: () => void) {
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}
export function currentPath() {
  return location.pathname
}

/**
 * Run a DOM update inside a view transition when the browser has them and motion is on. A
 * transition that is skipped (a second tap starts another, or the update is slow) rejects its
 * promises; that is expected, so it must not surface as an unhandled rejection.
 */
export function viewTransition(update: () => void | Promise<void>) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    void update()
    return
  }
  const transition = document.startViewTransition(update)
  transition.ready.catch(() => undefined)
  transition.finished.catch(() => undefined)
}

/** Keep native modified clicks; ordinary links support back/forward and shared hero snapshots. */
export function customerNavigate(event: MouseEvent<HTMLElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return
  if (!(event.currentTarget instanceof HTMLAnchorElement)) return
  const url = new URL(event.currentTarget.href)
  if (url.origin !== location.origin) return
  event.preventDefault()
  const old = { ...(history.state as object | null), scrollY: window.scrollY }
  history.replaceState(old, '')
  const update = () => {
    // Marks an in-app step, so "back" can return to the exact place it came from.
    history.pushState({ inApp: true }, '', url.pathname + url.search + url.hash)
    dispatchEvent(new PopStateEvent('popstate'))
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (url.hash)
      requestAnimationFrame(() =>
        document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView(),
      )
  }
  viewTransition(update)
}

/**
 * Back from a shop or a chat: when the customer came from inside the app (the conversation, a
 * list), go back in history so the page restores where they were; a shared link opens the
 * link's own target instead.
 */
export function customerBack(event: MouseEvent<HTMLElement>) {
  if ((history.state as { inApp?: boolean } | null)?.inApp && event.button === 0) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    viewTransition(
      () =>
        new Promise<void>((resolve) => {
          addEventListener('popstate', () => requestAnimationFrame(() => resolve()), {
            once: true,
          })
          history.back()
        }),
    )
    return
  }
  customerNavigate(event)
}

/** Navigate in the customer app without a click (a spoken command), keeping back/forward. */
export function goTo(path: string) {
  history.replaceState({ ...(history.state as object | null), scrollY: window.scrollY }, '')
  history.pushState({ inApp: true, scrollY: 0 }, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'instant' })
}
