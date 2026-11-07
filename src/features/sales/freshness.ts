import { useEffect, useState } from 'react'
import { formatLocale, type Locale } from '../../i18n/locales'
import { useWorkspace } from '../v1/workspaceContext'

export interface Freshness {
  today: string
  monday: boolean
  recap_week?: string
  last_confirmed: string | null
}
/** ISO weeks are Monday–Sunday; UTC keeps date-only boundaries stable on every device. */
export function weekRange(week: string, locale: Locale) {
  const year = Number(week.slice(0, 4))
  const january4 = new Date(Date.UTC(year, 0, 4))
  const monday = new Date(january4)
  monday.setUTCDate(4 - ((january4.getUTCDay() + 6) % 7) + (Number(week.slice(-2)) - 1) * 7)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return new Intl.DateTimeFormat(formatLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: monday.getUTCFullYear() !== sunday.getUTCFullYear() ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).formatRange(monday, sunday)
}

export function useFreshness() {
  const { api, active } = useWorkspace()
  const [value, setValue] = useState<Freshness | null>(null)
  const [error, setError] = useState(false)
  const [attempt, retry] = useState(0)
  const id = active?.id
  const confirmed = active?.last_confirmed
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const load = () => {
      void api<Freshness>(`/businesses/${id}/freshness`, { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted) {
            setValue(next)
            setError(false)
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true)
        })
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [api, id, confirmed, attempt])
  return { value, error, retry: () => retry((n) => n + 1) }
}
