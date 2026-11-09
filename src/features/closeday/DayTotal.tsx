import { useState } from 'react'
import { Box, Button, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { moneyLocale } from '../../region/region'
import { currencySymbol, exponent, formatShopPrice, toMajor, toMinor } from '../v1/format'
import { readNumber } from '../v1/readNumber'
import type { NumberReading } from '../v1/readNumber'
import { closeDayCopy } from './strings'
import { dayTotalCopy } from './totalCopy'

/** Major units, as the owner typed them; the split is only there when they gave one. */
export type DayTotalEntry = { total: number; cash: number | null; upi: number | null }
export type DayTotalText = { total: string; cash: string; upi: string }

export const NO_TOTAL: DayTotalText = { total: '', cash: '', upi: '' }

/**
 * What the three fields come to. Only the total is needed. Cash and UPI are optional, one gives
 * the other, and with no total the two of them are the total. `problem` keeps Check from moving on.
 */
export function readDayTotal(
  text: DayTotalText,
  currency: string,
  locale: string,
): { entry: DayTotalEntry | null; started: boolean; sum: number | null; total: number | null } {
  const read = (value: string) => readNumber(value, locale, currency, 'money')
  const minor = (reading: NumberReading) => (reading.ok ? toMinor(reading.value, currency) : null)
  const typedTotal = minor(read(text.total))
  let cash = minor(read(text.cash))
  let upi = minor(read(text.upi))
  const started = Boolean(text.total.trim() || text.cash.trim() || text.upi.trim())
  const unreadable =
    (text.total.trim() && typedTotal === null) ||
    (text.cash.trim() && cash === null) ||
    (text.upi.trim() && upi === null)
  const total = typedTotal ?? (cash !== null && upi !== null ? cash + upi : null)
  if (unreadable || total === null || total <= 0)
    return { entry: null, started, sum: null, total: null }
  if (cash !== null && upi === null) upi = total - cash
  if (upi !== null && cash === null) cash = total - upi
  const split = cash !== null && upi !== null
  if (split && (cash! < 0 || upi! < 0 || cash! + upi! !== total))
    return {
      entry: null,
      started,
      sum: (minor(read(text.cash)) ?? 0) + (minor(read(text.upi)) ?? 0),
      total,
    }
  return {
    entry: {
      total: toMajor(total, currency),
      cash: split ? toMajor(cash!, currency) : null,
      upi: split ? toMajor(upi!, currency) : null,
    },
    started,
    sum: null,
    total,
  }
}

/** One total for the day, cash and UPI if the owner wants them. Never saved as made-up items. */
export function DayTotalForm({
  text,
  currency,
  check,
  onChange,
  onItems,
}: {
  text: DayTotalText
  currency: string
  /** Bumped when Check is tapped while something here needs an answer: show it. */
  check: number
  onChange: (text: DayTotalText) => void
  onItems: () => void
}) {
  const locale = useLocale()
  const copy = closeDayCopy(locale)
  const t = dayTotalCopy(locale, currency)
  const numberLocale = moneyLocale(currency, locale) ?? locale
  const [splitOpen, setSplitOpen] = useState(Boolean(text.cash || text.upi))
  const [left, setLeft] = useState(false)
  const [seenCheck] = useState(check)
  const tried = left || check > seenCheck
  const money = (minor: number) => formatShopPrice(minor, currency, locale)
  const example = copy.numberInvalid.replace(
    '{example}',
    new Intl.NumberFormat(numberLocale).format(exponent(currency) === 0 ? 1000 : 1000.5),
  )
  const issue = (value: string) => {
    const reading = readNumber(value, numberLocale, currency, 'money')
    if (reading.ok || reading.reason === 'empty') return ''
    if (reading.reason !== 'ambiguous') return example
    return copy.numberQuestion
      .replace('{a}', money(toMinor(reading.options[0], currency)))
      .replace('{b}', money(toMinor(reading.options[1], currency)))
  }
  const { entry, sum, total } = readDayTotal(text, currency, numberLocale)
  const mismatch =
    sum !== null && total !== null
      ? t.mismatch.replace('{sum}', money(sum)).replace('{total}', money(total))
      : ''
  const field = (name: keyof DayTotalText, label: string, shown: string, autoFocus = false) => {
    const message = tried ? issue(text[name]) : ''
    const reading = readNumber(text[name], numberLocale, currency, 'money')
    return (
      <TextField
        name={name}
        label={label}
        autoFocus={autoFocus}
        value={text[name]}
        error={Boolean(message)}
        // The amount exactly as it will be saved (₹1,00,000), so a slip shows before Check.
        helperText={
          message || (reading.ok ? `= ${money(toMinor(reading.value, currency))}` : shown)
        }
        onChange={(event) => onChange({ ...text, [name]: event.target.value })}
        onBlur={() => setLeft(true)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">{currencySymbol(currency)}</InputAdornment>
            ),
          },
          htmlInput: { inputMode: 'decimal', autoComplete: 'off' },
          formHelperText: { 'aria-live': 'polite' },
        }}
        sx={{ flex: 1, minWidth: 0 }}
      />
    )
  }
  // One side typed: the other is worked out, and shown.
  const worked = (name: 'cash' | 'upi') =>
    entry && !text[name].trim() && entry[name] !== null
      ? `= ${money(toMinor(entry[name]!, currency))}`
      : undefined
  return (
    <Box
      component="form"
      noValidate
      aria-labelledby="close-day-total-title"
      data-testid="close-day-total"
      onSubmit={(event) => event.preventDefault()}
      sx={{ mt: 4 }}
    >
      <Typography id="close-day-total-title" component="h3" variant="titleMedium" sx={{ mb: 2 }}>
        {t.title}
      </Typography>
      <Stack spacing={2}>
        {field('total', t.total, '', true)}
        {splitOpen ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2 }}>
            {field('cash', t.cash, worked('cash') ?? '')}
            {field('upi', t.online, worked('upi') ?? '')}
          </Stack>
        ) : (
          <Button
            onClick={() => setSplitOpen(true)}
            aria-expanded={false}
            sx={{ alignSelf: 'flex-start', minHeight: 48, textAlign: 'start' }}
          >
            {t.splitOpen}
          </Button>
        )}
        {mismatch && (
          <Typography role="alert" variant="bodyMedium" color="error">
            {mismatch}
          </Typography>
        )}
        <Button
          color="inherit"
          onClick={onItems}
          sx={{ alignSelf: 'flex-start', minHeight: 48, textAlign: 'start' }}
        >
          {t.itemsInstead}
        </Button>
      </Stack>
    </Box>
  )
}
