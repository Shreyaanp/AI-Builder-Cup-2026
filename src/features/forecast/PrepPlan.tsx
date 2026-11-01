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
import { dayLabel, leadNeed, useOnOrderText, useSupply } from '../supply/supplyData'
import { useOrderChangeCopy } from '../supply/orderChangeCopy'

type Forecast = components['schemas']['Forecast']
const LOW_STOCK = 5

export function PrepPlanTile() {
  const { api, active, products, startCoachDraft, readOnlyMessage } = useWorkspace()
  // Only the public demo (a read-only workspace) gets the detail sheet.
  const demo = Boolean(readOnlyMessage)
  const t = useCopy()
  const s = useSourcingCopy()
  const c = useOrderChangeCopy()
  const locale = useLocale()
  // The supply needs are the one source for "runs out" and "on order", same as Today.
  const { data: supply } = useSupply(true)
  const onOrderText = useOnOrderText()
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
  // Runs out and on order come from the supply needs only, the list Today reads, so the two
  // screens cannot disagree (#603): the first need not yet covered leads, with how many more.
  // Only items with no forecast at all fall back to "running low" at a stock of 5 or less.
  const { need, more } = leadNeed(supply?.needs)
  const onOrder = need ? onOrderText(need) : ''
  const forecastFor = new Set((value?.predictions ?? []).map((row) => row.item.toLowerCase()))
  const low =
    supply && value && !need
      ? products.filter(
          (p) => p.stock != null && p.stock <= LOW_STOCK && !forecastFor.has(p.name.toLowerCase()),
        )
      : []
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
        ask="forecast"
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
      {(need || low.length > 0) && (
        <Tile
          icon={<PackageSearch size={20} />}
          label={
            need
              ? s.runsOut(need.item, dayLabel(need.runs_out, locale))
              : s.runningLow(
                  low
                    .map((item) => item.name)
                    .slice(0, 3)
                    .join(', '),
                )
          }
          value={need?.covered ? onOrder : s.findSuppliers}
          onClick={() => {
            const name = (need?.item ?? low[0]?.name ?? '').toLowerCase()
            startCoachDraft(need?.covered ? c.reorderPrompt(name) : s.lowMessage(name), {
              send: true,
            })
          }}
        >
          {/* Partly on order still needs ordering: what is coming shows under Find suppliers. */}
          {need && !need.covered && onOrder && <Supporting>{onOrder}</Supporting>}
          {more > 0 && <Supporting>{c.moreRunOut(more)}</Supporting>}
        </Tile>
      )}
    </>
  )
}
