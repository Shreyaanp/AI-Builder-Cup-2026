import { useEffect, useState } from 'react'
import type { components } from '../../api/generated'

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

/** `mm:ss` in the last hour, `1 h 20 min` before that (real end times only). */
export function countdown(ms: number, locale: string) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) {
    const seconds = Math.max(0, Math.floor((ms % 60_000) / 1000))
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }
  const unit = (value: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value)
  return `${unit(Math.floor(minutes / 60), 'hour')} ${unit(minutes % 60, 'minute')}`
}

export function clock(seconds: number, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(
    seconds * 1000,
  )
}

export function distanceText(m: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: m < 1000 ? 'meter' : 'kilometer',
    maximumFractionDigits: 1,
  }).format(m < 1000 ? Math.round(m / 10) * 10 : m / 1000)
}
