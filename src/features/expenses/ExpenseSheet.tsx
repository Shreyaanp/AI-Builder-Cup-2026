import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Trash2 } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { currencySymbol, toMajor } from '../v1/format'
import { AmountField } from './AmountField'
import { useAmount } from './useAmount'
import { CATEGORIES, moneyCopyFor, type Category } from './copy'
import type { Expense, ExpenseBody } from './useMoney'

/**
 * Add or change one expense: the amount, what for (six plain kinds and a note), cash or UPI.
 * The day is the one the money section shows (today by default). On a phone it fills the
 * screen so Save stays above the keyboard.
 */
export function ExpenseSheet({
  currency,
  day,
  expense,
  onSave,
  onDelete,
  onClose,
}: {
  currency: string
  /** The shop's today: the default date, and the latest one allowed. */
  day: string
  expense: Expense | null
  onSave: (body: ExpenseBody) => Promise<unknown>
  onDelete?: () => void
  onClose: () => void
}) {
  const locale = useLocale()
  const m = moneyCopyFor(locale)
  const roles = useTheme().material
  const phone = useMediaQuery('(max-width:599px)')
  const [text, setText] = useState(
    expense
      ? new Intl.NumberFormat('en-US', { useGrouping: false }).format(
          toMajor(expense.amount, currency),
        )
      : '',
  )
  const [category, setCategory] = useState<Category>(expense?.category ?? 'stock')
  const [note, setNote] = useState(expense?.note ?? '')
  const [method, setMethod] = useState<Expense['method']>(expense?.method ?? 'cash')
  const [date, setDate] = useState(day)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const amount = useAmount(text, currency)

  async function save() {
    setTried(true)
    if (amount.value === null || amount.value <= 0) return
    setBusy(true)
    setFailed(false)
    try {
      await onSave({
        amount: amount.value,
        category,
        note: note.trim(),
        method,
        ...(expense ? {} : { date: date && date <= day ? date : day }),
      })
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      fullScreen={phone}
      fullWidth
      maxWidth="xs"
      onClose={busy ? undefined : onClose}
      aria-labelledby="expense-sheet-title"
      slotProps={{ paper: { sx: { bgcolor: roles.surface } } }}
    >
      <DialogTitle id="expense-sheet-title" component="h3" sx={{ typography: 'titleLarge' }}>
        {expense ? m.editTitle : m.addTitle}
      </DialogTitle>
      <DialogContent>
        <Box
          component="form"
          id="expense-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          sx={{ display: 'flex', flexDirection: 'column', gap: 4, pt: 2 }}
        >
          <AmountField
            name="amount"
            label={m.amount(currencySymbol(currency))}
            text={text}
            onText={setText}
            currency={currency}
            showError={tried}
            autoFocus={!expense}
          />
          <Box role="group" aria-labelledby="expense-what-for">
            <Typography id="expense-what-for" variant="labelLarge" color="text.secondary">
              {m.whatFor}
            </Typography>
            <Stack direction="row" sx={{ mt: 2, gap: 2, flexWrap: 'wrap' }}>
              {CATEGORIES.map((key) => (
                <Chip
                  key={key}
                  label={m.category[key]}
                  variant={category === key ? 'filled' : 'outlined'}
                  aria-pressed={category === key}
                  onClick={() => setCategory(key)}
                  sx={{
                    minHeight: 40,
                    ...(category === key && {
                      bgcolor: roles.secondaryContainer,
                      color: roles.onSecondaryContainer,
                      '&:hover, &.Mui-focusVisible': { bgcolor: roles.secondaryContainer },
                    }),
                  }}
                />
              ))}
            </Stack>
          </Box>
          <TextField
            name="note"
            label={m.note}
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 60))}
            slotProps={{ htmlInput: { autoComplete: 'off' } }}
          />
          <Box role="group" aria-labelledby="expense-paid-by">
            <Typography id="expense-paid-by" variant="labelLarge" color="text.secondary">
              {m.paidBy}
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={method}
              onChange={(_, value: Expense['method'] | null) => value && setMethod(value)}
              sx={{ mt: 2, display: 'flex' }}
            >
              <ToggleButton value="cash" sx={{ flex: 1, minHeight: 48 }}>
                {m.cash}
              </ToggleButton>
              <ToggleButton value="upi" sx={{ flex: 1, minHeight: 48 }}>
                {m.upi}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {!expense && (
            <TextField
              name="date"
              type="date"
              label={m.date}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              slotProps={{ htmlInput: { max: day }, inputLabel: { shrink: true } }}
            />
          )}
          {failed && (
            <Typography role="alert" variant="bodyMedium" sx={{ color: roles.error }}>
              {m.failed}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions
        sx={{ px: 3, pb: 'max(16px, env(safe-area-inset-bottom))', gap: 2, flexWrap: 'wrap' }}
      >
        {onDelete && (
          <Button
            color="error"
            startIcon={<Trash2 size={18} />}
            disabled={busy}
            onClick={onDelete}
            sx={{ minHeight: 48, mr: 'auto' }}
          >
            {m.delete}
          </Button>
        )}
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>
          {m.cancel}
        </Button>
        <Button
          type="submit"
          form="expense-form"
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 48 }}
        >
          {m.save}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
