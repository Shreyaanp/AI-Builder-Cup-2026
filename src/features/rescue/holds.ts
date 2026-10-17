import { useEffect, useState } from 'react'
import type { components } from '../../api/generated'

export { countdown } from '../customer/countdown'
export { distanceText } from '../customer/distanceText'

export type Deal = components['schemas']['Deal']
export type PublicRescue = components['schemas']['PublicRescue']

/**
 * What this phone held ("Hold one for me"), so the Rescue tab can show it and a scan of that
 * shop's counter QR collects it. The server keeps the real hold ledger in the shop chat; this is
 * only the phone's reminder, and collecting is checked against the server's ledger.
 */
export type Hold = {
  rescue: string
  shop: string
  shopName: string
  item: string
  qty: number
  ends: number // epoch seconds
  thread: string
  demo: boolean
}

const KEY = 'chalkboard.rescue.holds.v1'
const change = 'chalkboard-rescue-holds'
// A hold can still be collected for 15 minutes after the pickup window (server rule).
const GRACE = 15 * 60

function read(): Hold[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(value)
      ? (value as Hold[]).filter((h) => typeof h?.rescue === 'string')
      : []
  } catch {
    return []
  }
}

export function holds(now = Date.now() / 1000): Hold[] {
  return read().filter((h) => h.ends + GRACE > now)
}

export function keepHold(hold: Hold) {
  try {
    const list = [...holds().filter((h) => h.rescue !== hold.rescue), hold].slice(-20)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* The hold is in the chat either way. */
  }
  window.dispatchEvent(new Event(change))
}

export function dropHold(rescue: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(read().filter((h) => h.rescue !== rescue)))
  } catch {
    /* Nothing to drop. */
  }
  window.dispatchEvent(new Event(change))
}

/** This phone's hold at a shop, still collectable: the counter QR collects it. */
export function holdAt(shop: string): Hold | null {
  return holds().find((h) => h.shop === shop) ?? null
}

export function useHolds() {
  const [list, setList] = useState(holds)
  useEffect(() => {
    const again = () => setList(holds())
    window.addEventListener(change, again)
    window.addEventListener('storage', again)
    return () => {
      window.removeEventListener(change, again)
      window.removeEventListener('storage', again)
    }
  }, [])
  return list
}

/** A clock for countdowns: ticks every second while something is counting. */
export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export function clock(seconds: number, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(
    seconds * 1000,
  )
}
