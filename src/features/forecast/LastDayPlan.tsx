import { Stack, Typography } from '@mui/material'
import { productName } from '../../i18n/productNames'
import { useLocale } from '../../state/hooks'
import { useLastDayWords, type LastDay } from './lastDayWords'

/** The plan until a forecast exists: what the closed day sold, and to make about the same. */
export function LastDayPlan({ day, lineClass }: { day: LastDay; lineClass?: string }) {
  const words = useLastDayWords()
  const locale = useLocale()
  const make = words.make(day)
  return (
    <Stack spacing={1} data-testid="last-day-plan">
      <Typography className={lineClass} variant="titleSmall" color="text.secondary">
        {words.heading(day)}
      </Typography>
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {day.rows.map((row) => (
          <Stack
            component="li"
            key={row.item}
            className={lineClass}
            direction="row"
            sx={{ gap: 2, justifyContent: 'space-between', alignItems: 'baseline' }}
          >
            <Typography variant="bodyLarge" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {productName(row.item, locale)}
            </Typography>
            <Typography
              variant="titleMedium"
              component="p"
              sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
            >
              {words.amount(row)}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {make && (
        <Typography className={lineClass} variant="bodyLarge" sx={{ pt: 1 }}>
          {make}
        </Typography>
      )}
    </Stack>
  )
}
