/**
 * Keeps the phone's screen on while a voice session is open (Screen Wake Lock API), so the
 * phone does not sleep mid-conversation and cut the microphone. The browser drops the lock
 * whenever the page is hidden, so it is taken again when the page is visible. A no-op where
 * the API is missing or refused (low battery, an insecure origin). Returns the release.
 */
export function keepScreenAwake(): () => void {
  if (!('wakeLock' in navigator)) return () => {}
  let lock: WakeLockSentinel | null = null
  let released = false
  let asking = false
  const acquire = () => {
    if (released || asking || document.visibilityState !== 'visible') return
    if (lock && !lock.released) return
    asking = true
    navigator.wakeLock.request('screen').then(
      (next) => {
        asking = false
        if (released) void next.release().catch(() => {})
        else lock = next
      },
      () => {
        asking = false
      },
    )
  }
  document.addEventListener('visibilitychange', acquire)
  acquire()
  return () => {
    released = true
    document.removeEventListener('visibilitychange', acquire)
    void lock?.release().catch(() => {})
    lock = null
  }
}
