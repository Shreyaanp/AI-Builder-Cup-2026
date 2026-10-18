import { useEffect, useId, useRef, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useLocale } from '../../state/hooks'
import { useShopCopy } from './strings'
import { weekdays, type DayHours } from './hoursModel'

function dayLabel(day: DayHours['day'], locale: string, short = false) {
  return new Intl.DateTimeFormat(locale, {
    weekday: short ? 'short' : 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, 0, 5 + weekdays.indexOf(day))))
}

function equalHours(hours: DayHours[]) {
  const open = hours.filter((entry) => !entry.closed)
  const first = open[0]
  return !first || open.every((entry) => entry.open === first.open && entry.close === first.close)
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
  const id = useId()
  const toggle = useRef<HTMLButtonElement>(null)
  const [perDay, setPerDay] = useState(false)
  const [returnFocus, setReturnFocus] = useState(false)
  const [shared, setShared] = useState({ open: '', close: '' })
  const enabled = value.length > 0
  const uniform = equalHours(value)
  const expanded = perDay || !uniform
  useEffect(() => {
    if (!expanded && returnFocus) toggle.current?.focus()
  }, [expanded, returnFocus])
  const times = value.find((entry) => !entry.closed) ?? shared
  const overnight = value.some(
    (entry) => !entry.closed && entry.open && entry.close && entry.close < entry.open,
  )
  function updateDays(next: DayHours[]) {
    onChange(next)
    if (equalHours(next)) {
      setPerDay(false)
      setReturnFocus(true)
    }
  }
  function timeFields(
    entry: Pick<DayHours, 'open' | 'close' | 'closed'>,
    change: (key: 'open' | 'close', time: string) => void,
    day?: DayHours['day'],
  ) {
    return (['open', 'close'] as const).map((key) => (
      <TextField
        key={key}
        label={key === 'open' ? t.opens : t.closes}
        type="time"
        size="small"
        disabled={entry.closed}
        value={entry[key] ?? ''}
        onChange={(event) => change(key, event.target.value)}
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: {
            'aria-label': day
              ? `${dayLabel(day, locale)}: ${key === 'open' ? t.opens : t.closes}`
              : key === 'open'
                ? t.opens
                : t.closes,
            'aria-describedby': overnight ? `${id}-overnight` : undefined,
            name: `${day ?? 'shared'}-${key}`,
            step: 60,
          },
        }}
        sx={{
          minWidth: 0,
          flex: 1,
          '& input': { px: 1, fontSize: 16, minHeight: 48, boxSizing: 'border-box' },
        }}
      />
    ))
  }
  return (
    <Stack spacing={1}>
      <FormControlLabel
        label={t.setWeeklyHours}
        control={
          <Checkbox
            checked={enabled}
            onChange={(_, checked) => {
              setPerDay(false)
              setShared({ open: '', close: '' })
              onChange(
                checked ? weekdays.map((day) => ({ day, closed: false, open: '', close: '' })) : [],
              )
            }}
            sx={{ minHeight: 48, minWidth: 48 }}
          />
        }
      />
      {enabled && (
        <>
          {!expanded && (
            <>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', pt: 2 }}>
                {timeFields({ ...times, closed: false }, (key, time) => {
                  setShared({ open: times.open ?? '', close: times.close ?? '', [key]: time })
                  onChange(value.map((entry) => (entry.closed ? entry : { ...entry, [key]: time })))
                }).flatMap((field, index) =>
                  index === 0
                    ? [
                        field,
                        <Typography key="separator" aria-hidden="true">
                          ·
                        </Typography>,
                      ]
                    : [field],
                )}
              </Stack>
              <Stack direction="row" sx={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {weekdays.map((day) => {
                  const entry = value.find((item) => item.day === day)
                  const selected = Boolean(entry && !entry.closed)
                  return (
                    <Chip
                      key={day}
                      component="button"
                      type="button"
                      label={dayLabel(day, locale, true)}
                      aria-label={dayLabel(day, locale)}
                      aria-pressed={selected}
                      variant={selected ? 'filled' : 'outlined'}
                      onClick={() => {
                        setShared({ open: times.open ?? '', close: times.close ?? '' })
                        onChange(
                          weekdays.map((key) =>
                            key === day
                              ? {
                                  day,
                                  closed: selected,
                                  open: selected ? null : (times.open ?? ''),
                                  close: selected ? null : (times.close ?? ''),
                                }
                              : (value.find((item) => item.day === key) ?? {
                                  day: key,
                                  closed: true,
                                }),
                          ),
                        )
                      }}
                      sx={{
                        minWidth: 48,
                        minHeight: 48,
                        height: 'auto',
                        '& .MuiChip-label': { px: 1 },
                      }}
                    />
                  )
                })}
              </Stack>
            </>
          )}
          <Button
            ref={toggle}
            aria-expanded={expanded}
            aria-controls={`${id}-days`}
            disabled={expanded && !uniform}
            onClick={() => setPerDay(!expanded)}
            sx={{ minHeight: 48, alignSelf: 'flex-start', textAlign: 'start' }}
          >
            {t.differentHours}
          </Button>
          <Stack id={`${id}-days`} spacing={2} hidden={!expanded}>
            {expanded && (
              <Typography variant="labelSmall" sx={{ width: 88, textAlign: 'right', pr: 1 }}>
                {t.closed}
              </Typography>
            )}
            {expanded &&
              weekdays.map((day) => {
                const entry = value.find((item) => item.day === day) ?? { day, closed: true }
                const update = (next: DayHours) =>
                  updateDays(
                    weekdays.map((key) =>
                      key === day
                        ? next
                        : (value.find((item) => item.day === key) ?? { day: key, closed: true }),
                    ),
                  )
                const label = dayLabel(day, locale)
                return (
                  <Stack key={day} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <FormControlLabel
                      label={dayLabel(day, locale, true)}
                      labelPlacement="start"
                      sx={{
                        m: 0,
                        width: 88,
                        flexShrink: 0,
                        justifyContent: 'space-between',
                        '& .MuiFormControlLabel-label': { typography: 'bodyMedium' },
                      }}
                      control={
                        <Checkbox
                          checked={entry.closed}
                          onChange={(_, closed) =>
                            update({
                              ...entry,
                              closed,
                              open: closed ? null : (times.open ?? ''),
                              close: closed ? null : (times.close ?? ''),
                            })
                          }
                          slotProps={{ input: { 'aria-label': `${label}: ${t.closed}` } }}
                          sx={{ minHeight: 48, minWidth: 48 }}
                        />
                      }
                    />
                    {timeFields(entry, (key, time) => update({ ...entry, [key]: time }), day)}
                  </Stack>
                )
              })}
          </Stack>
          {overnight && (
            <Typography id={`${id}-overnight`} variant="bodyMedium" color="text.secondary">
              {t.overnight}
            </Typography>
          )}
        </>
      )}
    </Stack>
  )
}

export function HoursList({ hours }: { hours?: DayHours[] }) {
  const t = useShopCopy()
  const locale = useLocale()
  if (!hours?.length) return null
  // Seven identical open days read as one line ("Mon–Sun 07:00–20:00").
  const first = hours[0]
  const same =
    hours.length === weekdays.length &&
    hours.every((item) => !item.closed && item.open === first?.open && item.close === first?.close)
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
        {same ? (
          <>
            <Typography component="dt" variant="bodyMedium">
              {dayLabel(weekdays[0]!, locale)}–{dayLabel(weekdays[weekdays.length - 1]!, locale)}
            </Typography>
            <Typography
              component="dd"
              variant="bodyMedium"
              sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {`${first!.open}–${first!.close}${first!.open! > first!.close! ? ' (+1)' : ''}`}
            </Typography>
          </>
        ) : (
          weekdays.flatMap((day) => {
            const entry = hours.find((item) => item.day === day)
            return entry
              ? [
                  <Typography component="dt" variant="bodyMedium" key={`${day}-label`}>
                    {dayLabel(day, locale)}
                  </Typography>,
                  <Typography
                    component="dd"
                    variant="bodyMedium"
                    key={day}
                    sx={{ m: 0, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {entry.closed
                      ? t.closed
                      : `${entry.open}–${entry.close}${entry.open! > entry.close! ? ' (+1)' : ''}`}
                  </Typography>,
                ]
              : []
          })
        )}
      </Box>
    </Box>
  )
}
