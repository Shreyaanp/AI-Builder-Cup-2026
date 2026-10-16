import { useEffect, useRef, useState } from 'react'
import type { Business } from './api'
import { useCopy } from './strings'

export type OwnerLocation = { lat: number; lng: number; accuracy_m: number }

/**
 * One explicit, fresh high-accuracy measurement per tap. Late callbacks cannot change a closed
 * shop or draft (the signal aborts on unmount).
 */
export function useMeasureLocation(
  onLocation: (point: OwnerLocation, signal: AbortSignal) => Promise<void>,
) {
  const t = useCopy()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(false)
  const pending = useRef(false)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      operation.current?.abort()
    }
  }, [])
  /** Resolves with the message shown when no location could be used ('' on success). */
  async function locate(): Promise<string> {
    if (pending.current) return ''
    setError('')
    if (!navigator.geolocation) {
      setError(t.locationFailed)
      return t.locationFailed
    }
    pending.current = true
    const abort = new AbortController()
    operation.current = abort
    setBusy(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
        }),
      )
      if (!alive.current) return ''
      const { latitude: lat, longitude: lng, accuracy: accuracy_m } = position.coords
      if (![lat, lng, accuracy_m].every(Number.isFinite) || accuracy_m < 0)
        throw new Error('INVALID_LOCATION')
      await onLocation({ lat, lng, accuracy_m }, abort.signal)
      return ''
    } catch (cause) {
      const message =
        cause && typeof cause === 'object' && 'code' in cause && cause.code === 1
          ? t.locationDenied
          : t.locationFailed
      if (alive.current) setError(message)
      return alive.current ? message : ''
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  return { locate, busy, error }
}

/** The pin as the owner would say it ("Near Indiranagar"), never raw coordinates. */
export function readablePlace(
  fields: Business['fields'],
  f: { current: string; near: (area: string) => string },
) {
  const raw = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/
  const label = fields.pin_label && !raw.test(fields.pin_label) ? fields.pin_label : fields.location
  return !label || label === 'Your current location'
    ? f.current
    : label.startsWith('Near ')
      ? f.near(label.slice(5))
      : label
}
