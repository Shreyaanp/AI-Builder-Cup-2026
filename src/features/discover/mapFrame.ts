import type { LatLng } from './mapsSdk'

/** Pins farther than this from the customer are not what the map is framed on. */
const NEAR_M = 4000

function metres(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.hypot(x, y) * 6_371_000
}

/**
 * The points a results map is framed on (A-19): the results themselves, with the customer in
 * view only when they are close to them, so "near me" never zooms out to the whole city to
 * include one far pin or a stale default point. Pins beyond 4 km are left out while any
 * nearer pin exists (they stay on the map and the list, just off the first frame).
 */
export function framePoints(
  center: LatLng,
  pins: LatLng[],
  anchor?: LatLng | null,
): { points: LatLng[]; includesCenter: boolean } {
  const near = pins.filter((pin) => metres(center, pin) <= NEAR_M)
  const results = near.length ? near : pins
  const closest = results.length ? Math.min(...results.map((pin) => metres(center, pin))) : 0
  const includesCenter = results.length === 0 || closest <= NEAR_M
  return {
    points: [...(includesCenter ? [center] : []), ...(anchor ? [anchor] : []), ...results],
    includesCenter,
  }
}
