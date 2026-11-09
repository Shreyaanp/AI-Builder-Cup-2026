import { Box, Stack, Typography, useTheme } from '@mui/material'
import { shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { formatShopPrice } from '../v1/format'
import { moneyCopyFor } from './copy'
import { useMoneyWeek } from './useMoney'

/** The week's sales, what was spent and what is left: shown once any expense is noted. */
export function WeekMoney() {
  const locale = useLocale()
  const m = moneyCopyFor(locale)
  const roles = useTheme().material
  const week = useMoneyWeek()
  if (!week || week.spent === 0) return null
  const show = (minor: number) => formatShopPrice(minor, week.currency, locale)
  const rows: [string, string, string][] = [
    ['sales', m.sales, show(week.sales)],
    ['spent', m.spent, show(week.spent)],
    ['left', m.left, show(week.left)],
  ]
  return (
    <Box
      component="section"
      aria-labelledby="week-money-title"
      data-testid="week-money"
      sx={{ p: 3, borderRadius: `${shape.lg}px`, border: `1px solid ${roles.outlineVariant}` }}
    >
      <Typography id="week-money-title" component="h3" variant="labelLarge" color="text.secondary">
        {m.week}
      </Typography>
      <Box component="dl" sx={{ m: 0, mt: 2, display: 'grid', gap: 1 }}>
        {rows.map(([key, label, value]) => (
          <Stack key={key} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
            <Typography component="dt" variant="bodyMedium" color="text.secondary">
              {label}
            </Typography>
            <Typography
              component="dd"
              variant={key === 'left' ? 'titleMedium' : 'bodyLarge'}
              sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {value}
            </Typography>
          </Stack>
        ))}
      </Box>
    </Box>
  )
}
