import { Box, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { useShopCopy } from './strings'
import { weekdays, type DayHours } from './hoursModel'

function dayLabel(day: DayHours['day'], locale: string, short = false) {
  return new Intl.DateTimeFormat(locale, {
    weekday: short ? 'short' : 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, 0, 5 + weekdays.indexOf(day))))
}

export function HoursEditor({
  value,
  onChange,
}: {
  value: DayHours[]
  onChange: (hours: DayHours[]) => void
}) {
  const t = useShopCopy()
  const locale = useLocale()
  const enabled = value.length > 0
  return (
    <Stack spacing={1}>
      <FormControlLabel
        label={t.setWeeklyHours}
        control={
          <Checkbox
            checked={enabled}
            onChange={(_, checked) =>
              onChange(checked ? weekdays.map((day) => ({ day, closed: true })) : [])
            }
          />
        }
      />
      {enabled && (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '40px 48px minmax(0,1fr) minmax(0,1fr)',
              gap: 1,
              alignItems: 'center',
            }}
          >
            <span />
            {[t.closed, t.opens, t.closes].map((label, i) => (
              <Typography key={i} variant="labelSmall">
                {label}
              </Typography>
            ))}
            {weekdays.map((day) => {
              const entry = value.find((item) => item.day === day) ?? { day, closed: true }
              const update = (next: DayHours) =>
                onChange(
                  weekdays.map((key) =>
                    key === day
                      ? next
                      : (value.find((item) => item.day === key) ?? { day: key, closed: true }),
                  ),
                )
              const label = dayLabel(day, locale)
              return (
                <Box key={day} sx={{ display: 'contents' }}>
                  <Typography variant="bodySmall">{dayLabel(day, locale, true)}</Typography>
                  <Checkbox
                    checked={entry.closed}
                    onChange={(_, closed) =>
                      update({
                        ...entry,
                        closed,
                        open: closed ? null : '',
                        close: closed ? null : '',
                      })
                    }
                    slotProps={{ input: { 'aria-label': `${label}: ${t.closed}` } }}
                    sx={{ minHeight: 48, minWidth: 48 }}
                  />
                  {(['open', 'close'] as const).map((key) => (
                    <TextField
                      key={key}
                      type="time"
                      size="small"
                      disabled={entry.closed}
                      value={entry[key] ?? ''}
                      onChange={(event) => update({ ...entry, [key]: event.target.value })}
                      slotProps={{
                        htmlInput: {
                          'aria-label': `${label}: ${key === 'open' ? t.opens : t.closes}`,
                          name: `${day}-${key}`,
                          step: 60,
                        },
                      }}
                      sx={{ minWidth: 0, '& input': { px: 1, fontSize: 16, minHeight: 32 } }}
                    />
                  ))}
                </Box>
              )
            })}
          </Box>
          <Typography variant="bodySmall" color="text.secondary">
            {t.overnight}
          </Typography>
        </>
      )}
    </Stack>
  )
}

export function HoursList({ hours }: { hours?: DayHours[] }) {
  const t = useShopCopy()
  const locale = useLocale()
  if (!hours?.length) return null
  return (
    <Box component="section" aria-label={t.weeklyHours}>
      <Typography component="h3" variant="titleSmall">
        {t.weeklyHours}
      </Typography>
      <Box
        component="dl"
        sx={{
          m: 0,
          mt: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) auto',
          columnGap: 2,
          rowGap: 1,
        }}
      >
        {weekdays.flatMap((day) => {
          const entry = hours.find((item) => item.day === day)
          return entry
            ? [
                <Typography component="dt" variant="bodySmall" key={`${day}-label`}>
                  {dayLabel(day, locale)}
                </Typography>,
                <Typography
                  component="dd"
                  variant="bodySmall"
                  key={day}
                  sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}
                >
                  {entry.closed
                    ? t.closed
                    : `${entry.open}–${entry.close}${entry.open! > entry.close! ? ' (+1)' : ''}`}
                </Typography>,
              ]
            : []
        })}
      </Box>
    </Box>
  )
}
