import { useState } from 'react'
import { Box, Button, CircularProgress, Stack, Typography, useTheme } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { currencySymbol, formatShopPrice, toMajor } from '../v1/format'
import { AmountField } from './AmountField'
import { useAmount } from './useAmount'
import { moneyCopyFor } from './copy'
import type { MoneyDay } from './useMoney'

type CashBody = { opening?: number | null; counted?: number | null; upi_sales?: number | null }

/** A saved minor amount as plain digits for a field ("1000", "1000.5"). */
function typed(minor: number | null | undefined, currency: string): string {
  if (minor == null) return ''
  return new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 3 }).format(
    toMajor(minor, currency),
  )
}

/**
 * Cash in hand: opening cash + cash sales - expenses paid in cash = what should be in the
 * drawer. The owner types what they counted and sees the difference, once the day's sales are
 * in: before that there is nothing to compare it to. Splitting sales into cash and UPI is
 * optional; without it every sale counts as cash. A split saved with the day's one total is the
 * day's split, shown here but changed there.
 */
export function CashDrawer({
  data,
  currency,
  onSave,
}: {
  data: MoneyDay
  currency: string
  onSave: (body: CashBody) => Promise<unknown>
}) {
  const locale = useLocale()
  const m = moneyCopyFor(locale)
  const roles = useTheme().material
  const cash = data.cash
  const symbol = currencySymbol(currency)
  const [opening, setOpening] = useState(typed(cash.opening, currency))
  const [upi, setUpi] = useState(typed(cash.upi_sales, currency))
  const [counted, setCounted] = useState(typed(cash.counted, currency))
  const [split, setSplit] = useState(cash.upi_sales != null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const readings = {
    opening: useAmount(opening, currency),
    upi_sales: useAmount(upi, currency),
    counted: useAmount(counted, currency),
  }
  const show = (minor: number) => formatShopPrice(minor, currency, locale)
  const saved = { opening: cash.opening, upi_sales: cash.upi_sales, counted: cash.counted }

  async function save() {
    setTried(true)
    if (Object.values(readings).some((r) => r.problem)) return
    const body: CashBody = {}
    for (const key of ['opening', 'upi_sales', 'counted'] as const) {
      if (key === 'upi_sales' && fromTotal) continue
      const value = readings[key].value
      const before = saved[key] == null ? null : toMajor(saved[key], currency)
      if (value !== before) body[key] = value
    }
    if (Object.keys(body).length === 0) return
    setBusy(true)
    setFailed(false)
    try {
      await onSave(body)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const difference = cash.difference
  const salesIn = data.sales != null
  const fromTotal = cash.upi_from === 'total'
  const lines: [string, string, string][] = [
    [
      'opening',
      cash.opening_from ? `${m.opening} · ${m.openingFrom[cash.opening_from]}` : m.opening,
      show(cash.opening ?? 0),
    ],
    ['cash-sales', m.cashSales, salesIn ? show(cash.cash_sales) : m.salesNotYet],
    ['cash-spent', m.cashSpent, show(cash.cash_spent)],
  ]
  return (
    <Box
      component="section"
      aria-labelledby="cash-drawer-title"
      data-testid="cash-drawer"
      sx={{ mt: 4, pt: 3, borderTop: `1px solid ${roles.outlineVariant}` }}
    >
      <Typography id="cash-drawer-title" component="h4" variant="titleSmall">
        {m.drawer}
      </Typography>
      <Box component="dl" sx={{ m: 0, mt: 2, display: 'grid', gap: 1 }}>
        {lines.map(([key, label, value]) => (
          <Stack key={key} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
            <Typography component="dt" variant="bodyMedium" color="text.secondary">
              {label}
            </Typography>
            <Typography
              component="dd"
              variant="bodyLarge"
              sx={{ m: 0, fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}
            >
              {value}
            </Typography>
          </Stack>
        ))}
        <Stack
          direction="row"
          data-testid="cash-expected"
          sx={{ justifyContent: 'space-between', gap: 2 }}
        >
          <Typography component="dt" variant="titleSmall">
            {m.expected}
          </Typography>
          <Typography
            component="dd"
            variant={salesIn ? 'titleMedium' : 'bodyMedium'}
            color={salesIn ? undefined : 'text.secondary'}
            sx={{ m: 0, fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}
          >
            {salesIn ? show(cash.expected) : m.expectedLater}
          </Typography>
        </Stack>
      </Box>
      {difference != null && (
        <Typography
          role="status"
          data-testid="cash-difference"
          variant="titleMedium"
          sx={{ mt: 2, color: difference < 0 ? roles.error : roles.primary }}
        >
          {difference === 0
            ? m.matches
            : difference < 0
              ? m.short(show(-difference))
              : m.extra(show(difference))}
        </Typography>
      )}
      {!salesIn && cash.counted != null && (
        <Typography
          role="status"
          data-testid="cash-waiting"
          variant="bodyMedium"
          color="text.secondary"
          sx={{ mt: 2 }}
        >
          {m.afterSales}
        </Typography>
      )}
      {fromTotal && cash.upi_sales != null && (
        <Typography
          data-testid="cash-upi-from-total"
          variant="bodySmall"
          color="text.secondary"
          sx={{ mt: 1 }}
        >
          {m.upiFromTotal(show(cash.upi_sales))}
        </Typography>
      )}
      {cash.upi_sales == null && data.sales != null && !split && (
        <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
          {m.allCash}
        </Typography>
      )}
      {/* Not a form: the close screen's typed sales keep the only submit button in the dialog. */}
      <Stack sx={{ mt: 3, gap: 3 }}>
        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
          <AmountField
            name="opening"
            inRow
            label={m.openingAsk(symbol)}
            text={opening}
            onText={setOpening}
            currency={currency}
            showError={tried}
          />
          <AmountField
            name="counted"
            inRow
            label={m.counted(symbol)}
            text={counted}
            onText={setCounted}
            currency={currency}
            showError={tried}
          />
        </Stack>
        {fromTotal ? null : split ? (
          <AmountField
            name="upi"
            label={m.upiSales(symbol)}
            text={upi}
            onText={setUpi}
            currency={currency}
            showError={tried}
          />
        ) : (
          <Button onClick={() => setSplit(true)} sx={{ alignSelf: 'flex-start', minHeight: 48 }}>
            {m.split}
          </Button>
        )}
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() => void save()}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ alignSelf: 'flex-start', minHeight: 48 }}
        >
          {m.saveCash}
        </Button>
        {failed && (
          <Typography role="alert" variant="bodyMedium" sx={{ color: roles.error }}>
            {m.failed}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
