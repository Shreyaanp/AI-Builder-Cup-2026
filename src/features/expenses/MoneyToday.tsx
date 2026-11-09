import { useState } from 'react'
import { Box, Button, ButtonBase, Snackbar, Stack, Typography, useTheme } from '@mui/material'
import { Plus } from 'lucide-react'
import { shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { formatShopPrice } from '../v1/format'
import { CashDrawer } from './CashDrawer'
import { moneyCopyFor } from './copy'
import { ExpenseSheet } from './ExpenseSheet'
import { useMoney, type Expense } from './useMoney'

/**
 * The close screen's money: today's sales, what was spent and what is left, each expense (tap to
 * change or delete, with Undo), and the cash that should be in the drawer. Each close-screen
 * state mounts it afresh, so the figures are read again after the day's sales are saved.
 */
export function MoneyToday({ day, currency }: { day: string; currency: string }) {
  const locale = useLocale()
  const m = moneyCopyFor(locale)
  const roles = useTheme().material
  const money = useMoney(day)
  const [sheet, setSheet] = useState<Expense | 'new' | null>(null)
  const [undo, setUndo] = useState<Expense | null>(null)
  const data = money.data
  const show = (minor: number) => formatShopPrice(minor, currency, locale)
  const rows: [string, string, string][] = data
    ? [
        ['sales', m.sales, data.sales == null ? m.salesNotYet : show(data.sales)],
        ['spent', m.spent, show(data.spent)],
        ...(data.left != null
          ? ([['left', m.left, show(data.left)]] as [string, string, string][])
          : []),
      ]
    : []
  return (
    <Box
      component="section"
      aria-labelledby="money-today-title"
      data-testid="money-today"
      sx={{
        mt: 4,
        p: 3,
        width: '100%',
        textAlign: 'start',
        borderRadius: `${shape.lg}px`,
        border: `1px solid ${roles.outlineVariant}`,
      }}
    >
      <Typography id="money-today-title" component="h3" variant="titleMedium">
        {m.title}
      </Typography>
      {data && (
        <Box component="dl" sx={{ m: 0, mt: 2, display: 'grid', gap: 1 }}>
          {rows.map(([key, label, value]) => (
            <Stack
              key={key}
              direction="row"
              data-testid={`money-${key}`}
              sx={{ justifyContent: 'space-between', gap: 2 }}
            >
              <Typography component="dt" variant="bodyMedium" color="text.secondary">
                {label}
              </Typography>
              <Typography
                component="dd"
                variant={key === 'left' ? 'titleMedium' : 'bodyLarge'}
                sx={{ m: 0, fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}
              >
                {value}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
      {data && data.expenses.length === 0 && (
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 2 }}>
          {m.noExpenses}
        </Typography>
      )}
      {data && data.expenses.length > 0 && (
        <Box component="ul" aria-label={m.spent} sx={{ m: 0, mt: 2, p: 0, listStyle: 'none' }}>
          {data.expenses.map((expense) => {
            const what = expense.note || m.category[expense.category]
            return (
              <li key={expense.id}>
                <ButtonBase
                  onClick={() => setSheet(expense)}
                  aria-label={m.edit(`${what} ${show(expense.amount)}`)}
                  sx={{
                    width: '100%',
                    minHeight: 48,
                    px: 2,
                    mx: -2,
                    gap: 2,
                    justifyContent: 'space-between',
                    textAlign: 'start',
                    borderRadius: `${shape.sm}px`,
                    '&:focus-visible': { outline: `3px solid ${roles.primary}` },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
                      {what}
                    </Typography>
                    <Typography variant="bodySmall" color="text.secondary">
                      {expense.note ? `${m.category[expense.category]} · ` : ''}
                      {expense.method === 'upi' ? m.upi : m.cash}
                    </Typography>
                  </Box>
                  <Typography variant="bodyLarge" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {show(expense.amount)}
                  </Typography>
                </ButtonBase>
              </li>
            )
          })}
        </Box>
      )}
      <Button
        variant="outlined"
        startIcon={<Plus size={18} />}
        onClick={() => setSheet('new')}
        disabled={!data}
        sx={{ mt: 2, minHeight: 48 }}
      >
        {m.add}
      </Button>
      {data && <CashDrawer data={data} currency={currency} onSave={money.cash} />}
      {money.failed && !data && (
        <Typography role="alert" variant="bodyMedium" sx={{ mt: 2, color: roles.error }}>
          {m.failed}
        </Typography>
      )}
      {sheet && (
        <ExpenseSheet
          currency={currency}
          day={day}
          expense={sheet === 'new' ? null : sheet}
          onSave={(body) => (sheet === 'new' ? money.add(body) : money.edit(sheet, body))}
          onDelete={
            sheet === 'new'
              ? undefined
              : () => {
                  const gone = sheet
                  setSheet(null)
                  void money.remove(gone).then(() => setUndo(gone))
                }
          }
          onClose={() => setSheet(null)}
        />
      )}
      <Snackbar
        open={Boolean(undo)}
        autoHideDuration={8000}
        onClose={(_, reason) => reason !== 'clickaway' && setUndo(null)}
        message={m.deleted}
        action={
          <Button
            color="inherit"
            onClick={() => {
              if (undo) void money.restore(undo)
              setUndo(null)
            }}
            sx={{ minHeight: 48 }}
          >
            {m.undo}
          </Button>
        }
      />
    </Box>
  )
}
