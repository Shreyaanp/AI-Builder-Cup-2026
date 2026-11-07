import { lazy, useEffect, useRef } from 'react'
import type { ComponentType } from 'react'

/**
 * A screen or sheet whose code loads apart from the first screen (OB-165), and can be fetched
 * ahead of use: when the phone is idle, or when the owner starts a tap.
 */
export function deferred<P extends object>(load: () => Promise<ComponentType<P>>) {
  let pending: Promise<{ default: ComponentType<P> }> | null = null
  // A failed fetch (offline, a deploy in between) is tried again by the next render or preload.
  const preload = () =>
    (pending ??= load().then(
      (component) => ({ default: component }),
      (error: unknown) => {
        pending = null
        throw error
      },
    ))
  return Object.assign(lazy(preload), { preload })
}

type Preload = () => Promise<unknown>
// The first screen's own data (Today, the shop list) comes first: on a slow phone link the
// preloads would otherwise share its bandwidth. A tap that needs the code fetches it at once.
const SETTLE_MS = 1500
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

/** Fetches the given code once the first screen has settled and the phone is idle. */
export function useIdlePreload(...preloads: Preload[]) {
  // Fetched once per mount; later renders never restart the queue.
  const queue = useRef(preloads)
  useEffect(() => {
    let cancelled = false
    const run = () => {
      // One at a time, so the fetches never compete with each other or with the screen's data.
      void queue.current.reduce<Promise<unknown>>(
        (chain, preload) => chain.then(() => (cancelled ? undefined : preload().catch(() => {}))),
        Promise.resolve(),
      )
    }
    const idle = window as IdleWindow
    let id: number | undefined
    const timer = window.setTimeout(() => {
      if (idle.requestIdleCallback) id = idle.requestIdleCallback(run, { timeout: 2000 })
      else run()
    }, SETTLE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (id !== undefined) idle.cancelIdleCallback?.(id)
    }
  }, [])
}
