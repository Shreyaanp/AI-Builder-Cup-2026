import { useSyncExternalStore } from 'react'

/** Whether the guided tour is running, shared by the launch buttons and the tour overlay. */
let running = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export const tour = {
  start() {
    running = true
    emit()
  },
  stop() {
    running = false
    emit()
  },
}

export function useTourRunning(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => running,
  )
}
