import { useEffect, useState } from 'react'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { productFeminine, productName } from '../../i18n/productNames'
import { useWorkspace } from '../v1/workspaceContext'
import type { Api } from '../v1/api'
import { useSourcingCopy } from '../sourcing/copy'
import { dayLabel, leadNeed, useOnOrderText, useSupply } from '../supply/supplyData'
import { useOrderChangeCopy } from '../supply/orderChangeCopy'

type Forecast = components['schemas']['Forecast']
const LOW_STOCK = 5

// Grow's How much to make row and the Buy stock runs-out card both read the forecast: they
// share one request instead of asking twice.
const inFlight = new Map<string, Promise<Forecast>>()
function fetchForecast(api: Api, id: string, key: string) {
  let request = inFlight.get(key)
  if (!request) {
    request = api<Forecast>(`/businesses/${encodeURIComponent(id)}/forecast`)
    inFlight.set(key, request)
    const done = () => inFlight.delete(key)
    request.then(done, done)
  }
  return request
}

export function useForecast() {
  const { api, active } = useWorkspace()
  const [loaded, setLoaded] = useState<{
    id: string
    revision: number
    value?: Forecast
    error?: boolean
  } | null>(null)
  const [attempt, retry] = useState(0)
  const id = active?.id
  const revision = active?.revision
  useEffect(() => {
    if (!id || revision === undefined) return
    const controller = new AbortController()
    void fetchForecast(api, id, `${id}:${revision}:${attempt}`)
      .then((value) => {
        if (!controller.signal.aborted) setLoaded({ id, revision, value })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id, revision, error: true })
      })
    return () => controller.abort()
  }, [api, id, revision, attempt])
  const state = loaded?.id === id && loaded?.revision === revision ? loaded : null
  return { state, value: state?.value, retry: () => retry((n) => n + 1) }
}

/**
 * What runs out first, from the supply needs Today reads, so the two screens cannot disagree
 * (#603): the first need not yet covered leads, with how many more. Only items with no forecast
 * at all fall back to "running low" at a stock of 5 or less.
 */
export function useRunsOut() {
  const { products, startCoachDraft } = useWorkspace()
  const s = useSourcingCopy()
  const c = useOrderChangeCopy()
  const locale = useLocale()
  const { data: supply } = useSupply(true)
  const { value } = useForecast()
  const onOrderText = useOnOrderText()
  const { need, more } = leadNeed(supply?.needs)
  const onOrder = need ? onOrderText(need) : ''
  const forecastFor = new Set((value?.predictions ?? []).map((row) => row.item.toLowerCase()))
  const low =
    supply && value && !need
      ? products.filter(
          (p) => p.stock != null && p.stock <= LOW_STOCK && !forecastFor.has(p.name.toLowerCase()),
        )
      : []
  if (!need && low.length === 0) return null
  return {
    need,
    more,
    onOrder,
    label: need
      ? s.runsOut(
          productName(need.item, locale),
          dayLabel(need.runs_out, locale),
          productFeminine(need.item, locale),
        )
      : s.runningLow(
          low
            .map((item) => productName(item.name, locale))
            .slice(0, 3)
            .join(', '),
        ),
    /** Asks the coach to reorder what is partly on order, or to find suppliers for the rest. */
    act: () => {
      const name = (need?.item ?? low[0]?.name ?? '').toLowerCase()
      startCoachDraft(need?.covered ? c.reorderPrompt(name) : s.lowMessage(name), { send: true })
    },
  }
}
