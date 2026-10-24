import { useEffect, useRef, useState } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { visuallyHidden } from '@mui/utils'
import { gsap } from 'gsap'
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react'
import type { components } from '../../api/generated'
import { useChalkTimeline } from '../../design/chalkMotion'
import { HAND_FONT } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { Sheet } from '../v1/Sheet'
import { Supporting, Tile } from '../v1/ShopTiles'
import { formatShopPrice } from '../v1/format'
import { useWorkspace } from '../v1/workspaceContext'
import { useAnalyticsCopy } from './copy'

type Analytics = components['schemas']['Analytics']
type Day = components['schemas']['Day']

function hasData(day: Day) {
  return [day.sales, day.views, day.questions, day.stamps].some((v) => v != null)
}

/** Week-on-week change in percent, or null when either week has no sales. */
function change(data: Analytics) {
  const now = data.week.sales
  const before = data.last_week.sales
  return now != null && before ? Math.round(((now - before) / before) * 100) : null
}

/**
 * "Your week": yesterday's pulse and this week against last week, from the nightly BigQuery
 * analytics (or the saved sales when those are off). Shown only once there is something to show.
 */
export function WeekPulseTile() {
  const { api, activeId } = useWorkspace()
  const t = useAnalyticsCopy()
  const locale = useLocale()
  const [data, setData] = useState<{ id: string; value: Analytics } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!activeId) return
    const controller = new AbortController()
    void api<Analytics>(`/businesses/${activeId}/analytics`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData({ id: activeId, value })
      })
      // A tile that cannot load stays hidden; the rest of the shop page is unaffected.
      .catch(() => undefined)
    return () => controller.abort()
  }, [api, activeId])
  const value = data?.id === activeId ? data.value : null
  if (!value || !value.days.some(hasData)) return null
  const delta = change(value)
  return (
    <>
      <Tile
        wide
        icon={<BarChart3 size={20} />}
        label={t.title}
        value={
          value.week.sales != null ? formatShopPrice(value.week.sales, value.currency, locale) : '—'
        }
        onClick={() => setOpen(true)}
      >
        <Supporting>
          {delta != null ? `${delta > 0 ? '+' : ''}${delta}% ${t.vsLastWeek}` : t.hint}
        </Supporting>
      </Tile>
      <Sheet open={open} onClose={() => setOpen(false)} titleId="week-pulse-title" title={t.title}>
        {open && <WeekPulse data={value} />}
      </Sheet>
    </>
  )
}

export function WeekPulse({ data }: { data: Analytics }) {
  const theme = useTheme()
  const roles = theme.material
  const t = useAnalyticsCopy()
  const locale = useLocale()
  const scope = useRef<HTMLDivElement>(null)
  useChalkTimeline(scope, (root) => {
    gsap.from(root.querySelectorAll('[data-grow]'), {
      scaleY: 0,
      transformOrigin: '50% 100%',
      duration: 0.45,
      stagger: 0.035,
      ease: 'power2.out',
    })
  })
  const money = (minor: number) => formatShopPrice(minor, data.currency, locale)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  const days = data.days.slice(-7)
  const before = data.days.slice(0, -7)
  const peak = Math.max(1, ...data.days.map((d) => d.sales ?? 0))
  const delta = change(data)
  const up = (delta ?? 0) >= 0
  const tone = up ? theme.chalk.mint : theme.chalk.coral
  const pulse = [
    { label: t.sales, value: data.yesterday.sales, show: (v: number) => money(v) },
    { label: t.views, value: data.yesterday.views, show: (v: number) => number.format(v) },
    { label: t.questions, value: data.yesterday.questions, show: (v: number) => number.format(v) },
    { label: t.stamps, value: data.yesterday.stamps, show: (v: number) => number.format(v) },
  ].filter((p) => p.value != null)
  return (
    <Stack ref={scope} spacing={3}>
      {pulse.length > 0 && (
        <Box>
          <Typography variant="labelLarge" sx={{ color: roles.onSurfaceVariant, mb: 1 }}>
            {t.yesterday}
          </Typography>
          <Box
            component="dl"
            sx={{
              m: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 2,
            }}
          >
            {pulse.map((p) => (
              <Box
                key={p.label}
                sx={{ p: 2, borderRadius: '16px', bgcolor: roles.surfaceContainerLow }}
              >
                <Typography
                  component="dt"
                  variant="labelMedium"
                  sx={{ color: roles.onSurfaceVariant }}
                >
                  {p.label}
                </Typography>
                <Typography
                  component="dd"
                  sx={{
                    m: 0,
                    fontFamily: HAND_FONT,
                    fontSize: 28,
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {p.show(p.value!)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
      {data.week.sales != null && (
        <Box>
          <Typography variant="labelLarge" sx={{ color: roles.onSurfaceVariant }}>
            {t.thisWeek}
          </Typography>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
            <Typography
              sx={{ fontFamily: HAND_FONT, fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}
            >
              {money(data.week.sales)}
            </Typography>
            {delta != null && (
              <Chip
                size="small"
                icon={up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                label={`${up ? '+' : ''}${delta}% ${t.vsLastWeek}`}
                sx={{
                  bgcolor: tone.container,
                  color: tone.onContainer,
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            )}
          </Stack>
          <Typography variant="labelMedium" sx={{ color: roles.onSurfaceVariant }}>
            {t.daily}
          </Typography>
          <Box
            aria-hidden="true"
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${days.length}, 1fr)`,
              gap: 2,
              alignItems: 'end',
              height: 96,
              mt: 1,
            }}
          >
            {days.map((day, index) => {
              const previous = before[index]?.sales ?? null
              return (
                <Box key={day.date} sx={{ position: 'relative', height: '100%' }}>
                  {previous != null && (
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: `${(previous / peak) * 100}%`,
                        borderRadius: '8px 8px 4px 4px',
                        border: `2px dashed ${roles.outline}`,
                      }}
                    />
                  )}
                  <Box
                    data-grow
                    sx={{
                      position: 'absolute',
                      left: '20%',
                      right: '20%',
                      bottom: 0,
                      height: `${day.sales ? Math.max(4, (day.sales / peak) * 100) : 0}%`,
                      borderRadius: '8px 8px 4px 4px',
                      bgcolor: theme.chalk.mint.main,
                    }}
                  />
                </Box>
              )
            })}
          </Box>
          <Box
            aria-hidden="true"
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${days.length}, 1fr)`,
              gap: 2,
              mt: 1,
            }}
          >
            {days.map((day) => (
              <Typography
                key={day.date}
                variant="labelSmall"
                sx={{ textAlign: 'center', color: roles.onSurfaceVariant }}
              >
                {weekday.format(new Date(`${day.date}T12:00:00`))}
              </Typography>
            ))}
          </Box>
          <Stack direction="row" sx={{ gap: 2, mt: 1, flexWrap: 'wrap' }} aria-hidden="true">
            <Typography variant="bodySmall" sx={{ color: roles.onSurfaceVariant }}>
              <Box component="span" sx={{ color: theme.chalk.mint.main }}>
                ▮
              </Box>{' '}
              {t.thisWeek}
            </Typography>
            <Typography variant="bodySmall" sx={{ color: roles.onSurfaceVariant }}>
              ┆ {t.lastWeek}
            </Typography>
          </Stack>
          <Box component="table" sx={visuallyHidden}>
            <caption>{t.daily}</caption>
            <thead>
              <tr>
                <th scope="col">{t.thisWeek}</th>
                <th scope="col">{t.sales}</th>
                <th scope="col">{t.lastWeek}</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day, index) => (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  <td>{day.sales != null ? money(day.sales) : '—'}</td>
                  <td>{before[index]?.sales != null ? money(before[index].sales!) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      )}
      {data.forecast_error != null && (
        <Typography variant="bodyMedium">
          {t.forecast.replace('{n}', String(Math.max(1, Math.round(data.forecast_error * 100))))}
        </Typography>
      )}
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Chip size="small" label={data.source === 'bigquery' ? t.fromBigQuery : t.fromRecords} />
        {data.demo && <Chip size="small" label={t.demo} />}
      </Stack>
    </Stack>
  )
}
