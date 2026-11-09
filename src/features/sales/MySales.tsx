import { useId, useState } from 'react'
import { Box, ButtonBase, Collapse, Stack, Typography, useTheme } from '@mui/material'
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react'
import { shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { WeekPulse } from '../analytics/WeekPulse'
import { WeekMoney } from '../expenses/WeekMoney'
import { hasWeek, useAnalytics, useWeekLine } from '../analytics/weekData'
import { useGrowCopy } from '../v1/growCopy'
import { Sheet } from '../v1/Sheet'
import { Tile } from '../v1/ShopTiles'
import { useFreshness, weekRange } from './freshness'
import { RecapDetails } from './ShopInsights'

/**
 * Grow's My sales row (simplify batch 4b): what was Your week and Weekly recap. The row says
 * this week's sales and the change; the sheet shows the week, then last week's summary under its
 * own name, fetched only when opened. Hidden until there is a week or a summary to show.
 */
export function MySalesRow({ open, onOpen }: { open: boolean; onOpen: (open: boolean) => void }) {
  const grow = useGrowCopy()
  const locale = useLocale()
  const analytics = useAnalytics()
  const { value: fresh } = useFreshness()
  const week = fresh?.recap_week
  const days = hasWeek(analytics) ? analytics : null
  if (!days && !week) return null
  return (
    <>
      <Tile
        icon={<BarChart3 size={20} />}
        label={grow.sales}
        value={
          days ? <WeekLine data={days} /> : `${grow.weekSummary} · ${weekRange(week!, locale)}`
        }
        onClick={() => onOpen(true)}
      />
      <Sheet
        open={open}
        onClose={() => onOpen(false)}
        titleId="my-sales-title"
        ask="insights"
        title={grow.sales}
      >
        {open && (
          <Stack spacing={4}>
            {days && <WeekPulse data={days} />}
            <WeekMoney />
            {week && <Summary week={week} startOpen={!days} />}
          </Stack>
        )}
      </Sheet>
    </>
  )
}

function WeekLine({ data }: { data: NonNullable<ReturnType<typeof useAnalytics>> }) {
  return <>{useWeekLine(data)}</>
}

/** Last week's summary behind its name and dates: one tap opens it (it may be written by AI). */
function Summary({ week, startOpen }: { week: string; startOpen: boolean }) {
  const grow = useGrowCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const [shown, setShown] = useState(startOpen)
  const region = useId()
  const Chevron = shown ? ChevronDown : ChevronRight
  return (
    <Box>
      <ButtonBase
        aria-expanded={shown}
        aria-controls={region}
        onClick={() => setShown((value) => !value)}
        sx={{
          width: '100%',
          minHeight: 56,
          px: 4,
          py: 2,
          gap: 3,
          justifyContent: 'flex-start',
          textAlign: 'start',
          borderRadius: `${shape.lg}px`,
          bgcolor: roles.surfaceContainer,
          '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: -3 },
        }}
      >
        <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="span" variant="bodyLarge" sx={{ display: 'block' }}>
            {grow.weekSummary}
          </Typography>
          <Typography
            component="span"
            variant="bodySmall"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            {weekRange(week, locale)}
          </Typography>
        </Box>
        <Chevron size={18} aria-hidden="true" color={roles.onSurfaceVariant} />
      </ButtonBase>
      <Collapse in={shown} id={region} unmountOnExit>
        <Box sx={{ pt: 3 }}>
          <RecapDetails week={week} />
        </Box>
      </Collapse>
    </Box>
  )
}
