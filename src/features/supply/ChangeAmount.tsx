import { useState, type FormEvent } from 'react'
import { Button, MenuItem, Stack, TextField } from '@mui/material'
import { Pencil } from 'lucide-react'
import { unitChoices, useReadAmount } from './amount'
import { useOrderMoreCopy } from './orderMoreCopy'
import { useOrderUnit } from './unitLabel'

export type AmountRow = { key: number; label: string; quantity: number; unit: string }

/**
 * "Change amount" on an order that has not gone yet, right on its card (Ramesh, 8 Nov). It
 * changes that same draft, so there is never a second one to send by mistake.
 */
export function ChangeAmount({
  rows,
  disabled,
  onSave,
}: {
  rows: AmountRow[]
  disabled?: boolean
  onSave: (changes: { key: number; quantity: number; unit: string }[]) => Promise<boolean>
}) {
  const c = useOrderMoreCopy()
  const unit = useOrderUnit()
  const read = useReadAmount()
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<number, { text: string; unit: string }>>({})
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!editing)
    return (
      <Button
        startIcon={<Pencil size={16} />}
        disabled={disabled}
        onClick={() => {
          setValues(
            Object.fromEntries(
              rows.map((row) => [row.key, { text: String(row.quantity), unit: row.unit }]),
            ),
          )
          setWrong(false)
          setEditing(true)
        }}
        sx={{ alignSelf: 'flex-start', minHeight: 48 }}
      >
        {c.changeAmount}
      </Button>
    )
  async function submit(event: FormEvent) {
    event.preventDefault()
    const changes = rows.map((row) => ({
      key: row.key,
      quantity: read(values[row.key]?.text ?? ''),
      unit: values[row.key]?.unit ?? row.unit,
    }))
    if (changes.some((row) => row.quantity === null)) {
      setWrong(true)
      return
    }
    setBusy(true)
    const saved = await onSave(changes as { key: number; quantity: number; unit: string }[])
    setBusy(false)
    if (saved) setEditing(false)
  }
  return (
    <Stack component="form" noValidate spacing={2} onSubmit={(event) => void submit(event)}>
      {rows.map((row) => (
        <Stack key={row.key} direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          <TextField
            size="small"
            autoFocus={row === rows[0]}
            label={rows.length > 1 ? row.label : c.amount}
            value={values[row.key]?.text ?? ''}
            error={wrong}
            helperText={wrong ? c.enterAmount : undefined}
            onChange={(event) => {
              const text = event.target.value
              setValues((all) => ({ ...all, [row.key]: { unit: row.unit, ...all[row.key], text } }))
            }}
            slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 12 } }}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <TextField
            select
            size="small"
            label={c.unit}
            value={values[row.key]?.unit ?? row.unit}
            onChange={(event) => {
              const next = event.target.value
              setValues((all) => ({
                ...all,
                [row.key]: { text: all[row.key]?.text ?? '', unit: next },
              }))
            }}
            sx={{ width: 104, flexShrink: 0 }}
          >
            {unitChoices(row.unit).map((choice) => (
              <MenuItem key={choice} value={choice} sx={{ minHeight: 48 }}>
                {unit(choice)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      ))}
      <Button
        type="submit"
        variant="outlined"
        disabled={busy}
        sx={{ alignSelf: 'flex-start', minHeight: 48 }}
      >
        {c.changeAmount}
      </Button>
    </Stack>
  )
}
