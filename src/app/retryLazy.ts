import { createElement, lazy } from 'react'
import type { ComponentProps, ComponentType } from 'react'

/**
 * `React.lazy` keeps a failed import forever, so a screen whose code could not load (offline,
 * a dropped connection) stayed broken (A-18). These screens record a failed load (the app shell
 * then retries with a fresh page load) and can be fetched ahead with `preload()`.
 */
const failed = new Set<() => void>()

/** Forget failed screen loads; returns how many screens had failed. */
export function retryFailedScreens(): number {
  const resets = [...failed]
  failed.clear()
  resets.forEach((reset) => reset())
  return resets.length
}

// The same bound as React.lazy: any component, its props checked where it is used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function retryableLazy<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  const guarded = () =>
    load().catch((error: unknown) => {
      failed.add(reset)
      throw error
    })
  const holder = { Screen: lazy(guarded) }
  function reset() {
    holder.Screen = lazy(guarded)
  }
  function Retryable(props: ComponentProps<T>) {
    return createElement(holder.Screen as ComponentType<ComponentProps<T>>, props)
  }
  /** Fetch the screen's code ahead of time; a failure is ignored (the screen tries again). */
  Retryable.preload = () => {
    void load().catch(() => undefined)
  }
  return Retryable
}
