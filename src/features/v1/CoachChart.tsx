import { useRef } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { visuallyHidden } from '@mui/utils'
import { gsap } from 'gsap'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useChalkTimeline } from '../../design/chalkMotion'
import { HAND_FONT } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { fillChart, useChartCopy } from './chartCopy'
import { toMinor, formatPrice } from './format'

type Day = { date: string; quantity: number; lower: number | null; upper: number | null }
export type ForecastChart = {
  type: 'forecast'
  method: 'timesfm' | 'weekday_average' | null
  items: { item: string; unit: string; days: Day[] }[]
  insufficient_items: string[]
}
type Row = { item: string; quantity: number; revenue: number }
export type InsightsChart = {
  type: 'insights'
  currency: string
  revenue: number
  previous_revenue: number
  change_percent: number | null
  daily: { date: string; revenue: number }[]
  top: Row[]
  slow: Row[]
  sold_out_count: number
}
export type CoachChartData = ForecastChart | InsightsChart

/**
 * The numbers behind a coach answer, drawn in chalk: a forecast per item for the next 7 days, or
 * this week against last week. Lines draw themselves, bars grow in turn; reduced motion shows the
 * finished chart. Every chart also has a screen-reader table with the same numbers.
 */
export function CoachChart({ chart }: { chart: CoachChartData }) {
  const roles = useTheme().material
  const scope = useRef<HTMLDivElement>(null)
  useChalkTimeline(scope, (root) => {
    const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } })
    timeline.from(root, { y: 16, opacity: 0, duration: 0.35 })
    root.querySelectorAll<SVGPathElement>('[data-draw]').forEach((path) => {
      const length = path.getTotalLength()
      timeline.fromTo(
        path,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 0.9 },
        '<0.1',
      )
    })
    timeline.from(
      root.querySelectorAll('[data-grow]'),
      { scaleY: 0, transformOrigin: '50% 100%', duration: 0.45, stagger: 0.035 },
      '<0.1',
    )
    timeline.from(
      root.querySelectorAll('[data-bar]'),
      { scaleX: 0, transformOrigin: '0% 50%', duration: 0.5, stagger: 0.06 },
      '<',
    )
    timeline.from(root.querySelectorAll('[data-pop]'), {
      scale: 0,
      transformOrigin: '50% 50%',
      duration: 0.3,
      ease: 'back.out(3)',
    })
  })
  return (
    <Box
      ref={scope}
      sx={{
        flex: 1,
        maxWidth: 560,
        p: 4,
        borderRadius: '20px',
        bgcolor: roles.surfaceContainerLow,
        border: `1px solid ${roles.outlineVariant}`,
      }}
    >
      {chart.type === 'forecast' ? <Forecast chart={chart} /> : <Insights chart={chart} />}
    </Box>
  )
}

function Forecast({ chart }: { chart: ForecastChart }) {
  const theme = useTheme()
  const roles = theme.material
  const t = useChartCopy()
  const locale = useLocale()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  const items = chart.items.slice(0, 4)
  const peak = Math.max(1, ...items.flatMap((i) => i.days.map((d) => d.upper ?? d.quantity)))
  const summary = items
    .map((i) => `${i.item} ${number.format(i.days.reduce((s, d) => s + d.quantity, 0))}`)
    .join(', ')
  return (
    <Box role="figure" aria-label={fillChart(t.summaryForecast, { items: summary })}>
      <Stack direction="row" sx={{ alignItems: 'baseline', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Typography sx={{ fontFamily: HAND_FONT, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
          {t.forecastTitle}
        </Typography>
        {chart.method && (
          <Chip
            size="small"
            label={chart.method === 'timesfm' ? t.timesfm : t.weekdayAverage}
            sx={{ bgcolor: theme.chalk.sky.container, color: theme.chalk.sky.onContainer }}
          />
        )}
      </Stack>
      <Stack spacing={3}>
        {items.map((item, index) => {
          const tone =
            [theme.chalk.mint, theme.chalk.sunflower, theme.chalk.sky, theme.chalk.lilac][index] ??
            theme.chalk.mint
          const total = item.days.reduce((s, d) => s + d.quantity, 0)
          return (
            <Box key={item.item}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>
                  {item.item}
                </Typography>
                <Typography variant="labelLarge" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {number.format(total)} {item.unit}
                </Typography>
              </Stack>
              <Box
                aria-hidden="true"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${item.days.length}, 1fr)`,
                  gap: 1,
                  alignItems: 'end',
                  height: 64,
                }}
              >
                {item.days.map((day) => (
                  <Box key={day.date} sx={{ position: 'relative', height: '100%' }}>
                    {day.upper !== null && (
                      <Box
                        sx={{
                          position: 'absolute',
                          left: '35%',
                          right: '35%',
                          bottom: `${((day.lower ?? 0) / peak) * 100}%`,
                          height: `${(((day.upper ?? 0) - (day.lower ?? 0)) / peak) * 100}%`,
                          borderRadius: 1,
                          bgcolor: tone.container,
                        }}
                      />
                    )}
                    <Box
                      data-grow
                      sx={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: `${Math.max(4, (day.quantity / peak) * 100)}%`,
                        borderRadius: '6px 6px 2px 2px',
                        bgcolor: tone.main,
                        opacity: 0.9,
                      }}
                    />
                  </Box>
                ))}
              </Box>
              <Box
                aria-hidden="true"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${item.days.length}, 1fr)`,
                  gap: 1,
                  mt: 0.5,
                }}
              >
                {item.days.map((day) => (
                  <Typography
                    key={day.date}
                    variant="labelSmall"
                    sx={{ textAlign: 'center', color: roles.onSurfaceVariant }}
                  >
                    {weekday.format(new Date(`${day.date}T12:00:00`))}
                  </Typography>
                ))}
              </Box>
            </Box>
          )
        })}
      </Stack>
      {items.some((i) => i.days.some((d) => d.upper !== null)) && (
        <Typography variant="bodySmall" sx={{ mt: 2, color: roles.onSurfaceVariant }}>
          ▮ {t.forecastRange}
        </Typography>
      )}
      {chart.insufficient_items.length > 0 && (
        <Typography variant="bodySmall" sx={{ mt: 2, color: roles.onSurfaceVariant }}>
          {fillChart(t.notEnough, { items: chart.insufficient_items.join(', ') })}
        </Typography>
      )}
      <Box component="table" sx={visuallyHidden}>
        <tbody>
          {items.flatMap((item) =>
            item.days.map((day) => (
              <tr key={`${item.item}-${day.date}`}>
                <th scope="row">
                  {item.item} {day.date}
                </th>
                <td>
                  {number.format(day.quantity)} {item.unit}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </Box>
    </Box>
  )
}

function Insights({ chart }: { chart: InsightsChart }) {
  const theme = useTheme()
  const roles = theme.material
  const t = useChartCopy()
  const locale = useLocale()
  const money = (major: number) =>
    formatPrice(toMinor(major, chart.currency), chart.currency, locale)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const up = (chart.change_percent ?? 0) >= 0
  const change =
    chart.change_percent === null
      ? ''
      : `${up ? '+' : ''}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(chart.change_percent)}%`
  const tone = up ? theme.chalk.mint : theme.chalk.coral
  // Daily trend as one chalk line with a soft fill.
  const width = 300
  const height = 90
  const values = chart.daily.map((d) => d.revenue)
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const points = values.map((v, i) => [i * step, height - 8 - (v / max) * (height - 16)] as const)
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
  const area = points.length ? `${line}L${points.at(-1)![0].toFixed(1)},${height}L0,${height}Z` : ''
  const topMax = Math.max(1, ...chart.top.map((r) => r.quantity))
  return (
    <Box
      role="figure"
      aria-label={fillChart(t.summaryWeek, {
        revenue: money(chart.revenue),
        change: change || '—',
      })}
    >
      <Typography variant="labelLarge" sx={{ color: roles.onSurfaceVariant }}>
        {t.weekTitle}
      </Typography>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Typography sx={{ fontFamily: HAND_FONT, fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>
          {money(chart.revenue)}
        </Typography>
        {change && (
          <Chip
            data-pop
            size="small"
            icon={up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            label={`${change} ${t.vsLastWeek}`}
            sx={{
              bgcolor: tone.container,
              color: tone.onContainer,
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
        )}
      </Stack>
      {points.length > 1 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="labelMedium" sx={{ color: roles.onSurfaceVariant }}>
            {t.daily}
          </Typography>
          <Box
            component="svg"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            sx={{ display: 'block', width: '100%', height: 90, overflow: 'visible' }}
          >
            <path d={area} fill={theme.chalk.mint.container} opacity={0.6} />
            <path
              data-draw
              d={line}
              fill="none"
              stroke={theme.chalk.mint.main}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              data-pop
              cx={points.at(-1)![0]}
              cy={points.at(-1)![1]}
              r={5}
              fill={theme.chalk.mint.main}
            />
          </Box>
        </Box>
      )}
      {chart.top.length > 0 && (
        <Box sx={{ mb: chart.slow.length ? 3 : 0 }}>
          <Typography variant="labelMedium" sx={{ color: roles.onSurfaceVariant, mb: 1 }}>
            {t.top}
          </Typography>
          <Stack spacing={1}>
            {chart.top.map((row) => (
              <Box key={row.item}>
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="bodyMedium">{row.item}</Typography>
                  <Typography variant="bodyMedium" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {number.format(row.quantity)} · {money(row.revenue)}
                  </Typography>
                </Stack>
                <Box
                  data-bar
                  aria-hidden="true"
                  sx={{
                    height: 8,
                    mt: 0.5,
                    width: `${Math.max(4, (row.quantity / topMax) * 100)}%`,
                    borderRadius: 4,
                    bgcolor: theme.chalk.sunflower.main,
                  }}
                />
              </Box>
            ))}
          </Stack>
        </Box>
      )}
      {chart.slow.length > 0 && (
        <Typography variant="bodySmall" sx={{ color: roles.onSurfaceVariant }}>
          {t.slow}: {chart.slow.map((r) => r.item).join(', ')}
        </Typography>
      )}
      {chart.sold_out_count > 0 && (
        <Typography variant="bodySmall" sx={{ mt: 1, color: roles.onSurfaceVariant }}>
          {fillChart(t.soldOut, { n: chart.sold_out_count })}
        </Typography>
      )}
      <Box component="table" sx={visuallyHidden}>
        <tbody>
          {chart.daily.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{money(day.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  )
}
