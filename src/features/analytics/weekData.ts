import { useEffect, useState } from 'react'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { formatShopPrice } from '../v1/format'
import { useWorkspace } from '../v1/workspaceContext'
import { useAnalyticsCopy } from './copy'

export type Analytics = components['schemas']['Analytics']
type Day = components['schemas']['Day']

export function hasData(day: Day) {
  return [day.sales, day.views, day.questions, day.stamps].some((v) => v != null)
}

/** Week-on-week change in percent, or null when either week has no sales. */
export function change(data: Analytics) {
  const now = data.week.sales
  const before = data.last_week.sales
  return now != null && before ? Math.round(((now - before) / before) * 100) : null
}

/**
 * This week and yesterday, from the nightly BigQuery analytics (or the saved sales when those
 * are off). Null until loaded, and when it cannot load (My sales then shows the summary only).
 */
export function useAnalytics(): Analytics | null {
  const { api, activeId } = useWorkspace()
  const [data, setData] = useState<{ id: string; value: Analytics } | null>(null)
  useEffect(() => {
    if (!activeId) return
    const controller = new AbortController()
    void api<Analytics>(`/businesses/${activeId}/analytics`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData({ id: activeId, value })
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [api, activeId])
  return data?.id === activeId ? data.value : null
}

/** Whether the week has anything to show. */
export function hasWeek(data: Analytics | null): data is Analytics {
  return Boolean(data?.days.some(hasData))
}

/** "This week ₹43,883 · -2%": My sales' line on Grow. */
export function useWeekLine(data: Analytics): string {
  const t = useAnalyticsCopy()
  const locale = useLocale()
  const delta = change(data)
  return [
    data.week.sales != null
      ? `${t.thisWeek} ${formatShopPrice(data.week.sales, data.currency, locale)}`
      : t.hint,
    delta != null ? `${delta > 0 ? '+' : ''}${delta}%` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
