import { useEffect, useState } from 'react'
import { Stack, Typography } from '@mui/material'
import { CalendarClock, PackageSearch } from 'lucide-react'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { Tile, Supporting } from '../v1/ShopTiles'
import { useCopy } from '../v1/strings'
import { useWorkspace } from '../v1/workspaceContext'
import { useSourcingCopy } from '../sourcing/copy'

type Forecast = components['schemas']['Forecast']
const LOW_STOCK = 5

export function PrepPlanTile() {
  const { api, active, products, startCoachDraft } = useWorkspace()
  const t = useCopy()
  const s = useSourcingCopy()
  const locale = useLocale()
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
    void api<Forecast>(`/businesses/${encodeURIComponent(id)}/forecast`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setLoaded({ id, revision, value })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ id, revision, error: true })
      })
    return () => controller.abort()
  }, [api, id, revision, attempt])
  const state = loaded?.id === id && loaded?.revision === revision ? loaded : null
  const value = state?.value
  const tomorrow = value?.predictions?.[0]?.date
  const rows = value?.predictions?.filter((row) => row.date === tomorrow).slice(0, 3) ?? []
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  // Runs out: the first forecast day on which the week's predicted demand passes a counted
  // stock ("Croissant runs out Thu"). With no forecast for it, a stock of at most 5 is running
  // low. Items without a stock count never show here.
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const low = products.flatMap((product) => {
    if (product.stock == null) return []
    const days = (value?.predictions ?? [])
      .filter((row) => row.item.toLowerCase() === product.name.toLowerCase())
      .sort((a, b) => a.date.localeCompare(b.date))
    let demand = 0
    for (const row of days) {
      demand += row.quantity
      if (demand >= product.stock)
        return [{ name: product.name, day: weekday.format(new Date(`${row.date}T00:00:00Z`)) }]
    }
    return days.length === 0 && product.stock <= LOW_STOCK ? [{ name: product.name, day: '' }] : []
  })
  const first = low[0]
  return (
    <>
      <Tile
        wide
        tour="prep"
        icon={<CalendarClock size={20} />}
        label={t.prepPlan}
        value={
          state?.error
            ? t.actionFailed
            : !value
              ? t.prepLoading
              : value.status === 'insufficient'
                ? t.prepEmpty
                : t.prepTomorrow
        }
        onClick={() => {
          if (state?.error) retry((n) => n + 1)
          else startCoachDraft(t.prepQuestion)
        }}
      >
        {rows.length > 0 && (
          <Stack component="span" spacing={1}>
            {rows.map((row) => (
              <Typography
                key={row.item}
                component="span"
                variant="bodyMedium"
                sx={{ overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}
              >
                {row.item} · {number.format(row.quantity)} {row.unit}
              </Typography>
            ))}
          </Stack>
        )}
        {value && (
          <Supporting>{value.method === 'timesfm' ? t.prepTimesfm : t.prepWeekday}</Supporting>
        )}
        {state?.error && <Supporting>{t.retry}</Supporting>}
      </Tile>
      {first && (
        <Tile
          icon={<PackageSearch size={20} />}
          label={
            first.day
              ? s.runsOut(first.name, first.day)
              : s.runningLow(
                  low
                    .map((item) => item.name)
                    .slice(0, 3)
                    .join(', '),
                )
          }
          value={s.findSuppliers}
          onClick={() => startCoachDraft(s.lowMessage(first.name.toLowerCase()), { send: true })}
        />
      )}
    </>
  )
}
