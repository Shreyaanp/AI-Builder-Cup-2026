import { useEffect, useState } from 'react'
import { Stack, Typography } from '@mui/material'
import { CalendarClock } from 'lucide-react'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { Tile, Supporting } from '../v1/ShopTiles'
import { useCopy } from '../v1/strings'
import { useWorkspace } from '../v1/workspaceContext'

type Forecast = components['schemas']['Forecast']

export function PrepPlanTile() {
  const { api, active, startCoachDraft } = useWorkspace()
  const t = useCopy()
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
  return (
    <Tile
      wide
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
  )
}
