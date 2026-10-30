import { useEffect, useState } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import { CalendarClock, PackageSearch } from 'lucide-react'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { Tile, Supporting } from '../v1/ShopTiles'
import { useCopy } from '../v1/strings'
import { useWorkspace } from '../v1/workspaceContext'
import { useSourcingCopy } from '../sourcing/copy'
import { Sheet } from '../v1/Sheet'
import { dayLabel, useSupply } from '../supply/supplyData'
import { useOrderChangeCopy } from '../supply/orderChangeCopy'

type Forecast = components['schemas']['Forecast']
const LOW_STOCK = 5

export function PrepPlanTile() {
  const { api, active, products, startCoachDraft, readOnlyMessage } = useWorkspace()
  // Only the public demo (a read-only workspace) gets the shared rule and the detail sheet.
  const demo = Boolean(readOnlyMessage)
  const t = useCopy()
  const s = useSourcingCopy()
  const c = useOrderChangeCopy()
  const locale = useLocale()
  // The supply needs are the one source for "runs out" and "on order", same as Today.
  const { data: supply } = useSupply(true)
  const [loaded, setLoaded] = useState<{
    id: string
    revision: number
    value?: Forecast
    error?: boolean
  } | null>(null)
  const [attempt, retry] = useState(0)
  const [open, setOpen] = useState(false)
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
  const tomorrowRows = value?.predictions?.filter((row) => row.date === tomorrow) ?? []
  const rows = tomorrowRows.slice(0, 3)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  // Runs out: the first forecast day on which the week's predicted demand passes a counted
  // stock ("Croissant runs out Thu, Oct 23"). Same rule and same date format as the supply card
  // on Today (the forecast's upper bound), so the two never disagree. With no forecast for it,
  // a stock of at most 5 is running low. Items without a stock count never show here.
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
  const low = products.flatMap((product) => {
    if (product.stock == null) return []
    const days = (value?.predictions ?? [])
      .filter((row) => row.item.toLowerCase() === product.name.toLowerCase())
      .sort((a, b) => a.date.localeCompare(b.date))
    let demand = 0
    for (const row of days) {
      if (demo) {
        demand += row.upper ?? row.quantity
        if (demand > product.stock) return [{ name: product.name, day: dayLabel(row.date, locale) }]
      } else {
        demand += row.quantity
        if (demand >= product.stock)
          return [{ name: product.name, day: weekday.format(new Date(`${row.date}T00:00:00Z`)) }]
      }
    }
    return days.length === 0 && product.stock <= LOW_STOCK ? [{ name: product.name, day: '' }] : []
  })
  const first = low[0]
  const need =
    first && supply?.needs?.find((n) => n.item.toLowerCase() === first.name.toLowerCase())
  const covered = need?.on_order ? need : null
  const unit = first ? (products.find((p) => p.name === first.name)?.unit ?? '') : ''
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
          else if (demo) setOpen(true)
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
      <Sheet
        open={demo && open}
        onClose={() => setOpen(false)}
        titleId="prep-plan-title"
        title={t.prepPlan}
        actions={
          <Button
            variant="contained"
            sx={{ minHeight: 48 }}
            onClick={() => {
              setOpen(false)
              startCoachDraft(t.prepQuestion)
            }}
          >
            {t.navCoach}
          </Button>
        }
      >
        <Typography variant="titleSmall" color="text.secondary" sx={{ mb: 2 }}>
          {t.prepTomorrow}
        </Typography>
        {tomorrowRows.length > 0 ? (
          <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {tomorrowRows.map((row) => (
              <Stack
                component="li"
                key={row.item}
                direction="row"
                sx={{ gap: 2, justifyContent: 'space-between', alignItems: 'baseline' }}
              >
                <Typography variant="bodyLarge" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {row.item}
                </Typography>
                <Typography
                  variant="bodyLarge"
                  sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                >
                  {number.format(row.quantity)} {row.unit}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="bodyLarge">{t.prepEmpty}</Typography>
        )}
        {value && (
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 3 }}>
            {value.method === 'timesfm' ? t.prepTimesfm : t.prepWeekday}
          </Typography>
        )}
      </Sheet>
      {first && (
        <Tile
          icon={<PackageSearch size={20} />}
          label={
            need?.runs_out
              ? s.runsOut(first.name, dayLabel(need.runs_out, locale))
              : first.day
                ? s.runsOut(first.name, first.day)
                : s.runningLow(
                    low
                      .map((item) => item.name)
                      .slice(0, 3)
                      .join(', '),
                  )
          }
          value={
            covered
              ? c.onOrderLine(
                  number.format(covered.on_order ?? 0),
                  unit,
                  dayLabel(covered.arrives ?? '', locale),
                )
              : s.findSuppliers
          }
          onClick={() =>
            startCoachDraft(
              covered
                ? `reorder ${first.name.toLowerCase()}`
                : s.lowMessage(first.name.toLowerCase()),
              { send: true },
            )
          }
        />
      )}
    </>
  )
}
