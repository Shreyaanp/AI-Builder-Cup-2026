import { TextField } from '@mui/material'
import { useAmount } from './useAmount'

/**
 * A money field read with the app's one number reader: 1,000 · ₹1,000 · 170/- · 1,00,000. A
 * lone comma ("1,5") is asked about, never guessed.
 */
export function AmountField({
  label,
  text,
  onText,
  currency,
  showError,
  autoFocus,
  name,
  inRow = false,
}: {
  label: string
  text: string
  onText: (text: string) => void
  currency: string
  showError: boolean
  autoFocus?: boolean
  name: string
  /** Beside another field: share the row, wrapping below 160px each. */
  inRow?: boolean
}) {
  const amount = useAmount(text, currency)
  const message = amount.problem || (showError && amount.empty ? amount.example : '')
  return (
    <TextField
      name={name}
      label={label}
      value={text}
      autoFocus={autoFocus}
      error={Boolean(message)}
      helperText={message || amount.preview || undefined}
      onChange={(event) => onText(event.target.value)}
      slotProps={{
        htmlInput: { inputMode: 'decimal', autoComplete: 'off' },
        formHelperText: { 'aria-live': 'polite' },
      }}
      sx={inRow ? { flex: '1 1 160px', minWidth: 0 } : undefined}
    />
  )
}
