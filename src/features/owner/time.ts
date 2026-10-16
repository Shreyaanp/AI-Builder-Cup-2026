import type { Business } from '../v1/api'
import { weekdays } from '../shop/hoursModel'

/** The shop's own local date, weekday and minutes since midnight (its timezone, not the phone's). */
export function shopNow(timeZone: string, at = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: String(parts.weekday).slice(0, 3).toLowerCase() as (typeof weekdays)[number],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function minutesOf(text: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Today's closing time in minutes, from weekly hours or a plain "07:00–20:00"; null if none. */
export function closingMinutes(fields: Business['fields'], timeZone: string): number | null {
  const today = shopNow(timeZone)
  const weekly = fields.weekly_hours ?? []
  if (weekly.length) {
    const entry = weekly.find((day) => day.day === today.weekday)
    if (!entry || entry.closed) return null
    const close = minutesOf(entry.close ?? '')
    return close !== null && close < 24 * 60 ? close : null
  }
  const parts = fields.hours.replace(/-/g, '–').split('–')
  return parts.length === 2 ? minutesOf(parts[1]!) : null
}

/** A sensible pickup deadline: 15 minutes before closing, still in the future. */
export function defaultUntil(fields: Business['fields'], timeZone: string): string {
  const close = closingMinutes(fields, timeZone)
  if (close === null) return ''
  const now = shopNow(timeZone).minutes
  if (close <= now) return ''
  return hhmm(close - 15 > now + 10 ? close - 15 : close)
}
