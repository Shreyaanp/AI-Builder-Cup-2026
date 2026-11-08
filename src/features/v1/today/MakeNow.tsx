import { useState } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import { useWorkspace } from '../workspaceContext'
import { requestOpen } from '../openRequest'
import { StockStepper } from '../../shop/StockStepper'
import { makeAmount, useStockCopy } from '../../shop/stockCopy'

/**
 * "Make more" on a low item answers about now, not tomorrow (OB-310): how many to make, from
 * what usually sells today, and "Made 20" adds them to the stock at once. Tomorrow's plan stays
 * one tap away on Grow.
 */
export function MakeNow({
  name,
  left,
  usual,
  weekday,
  productId,
  onDone,
}: {
  /** The item in the owner's language. */
  name: string
  left: number
  usual: number | null
  weekday: number
  productId: string | null
  onDone: () => void
}) {
  const copy = useStockCopy()
  const ws = useWorkspace()
  const [amount, setAmount] = useState(() => makeAmount(left, usual))
  const [busy, setBusy] = useState(false)
  const product = ws.products.find((entry) => entry.id === productId)
  return (
    <Stack spacing={2} sx={{ flexBasis: '100%', minWidth: 0 }} data-testid="make-now">
      <Typography variant="bodyLarge" sx={{ fontWeight: 500 }}>
        {usual ? copy.makeNow(amount) : copy.howMany}
      </Typography>
      {usual ? (
        <Typography variant="bodyMedium" color="text.secondary">
          {copy.usually(usual, weekday)}
        </Typography>
      ) : null}
      <StockStepper
        name={name}
        label={copy.amount}
        value={amount}
        onChange={(next) => setAmount(Math.max(1, next))}
      >
        <Typography
          variant="titleLarge"
          aria-live="polite"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {amount}
        </Typography>
      </StockStepper>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          disabled={busy || !product}
          sx={{ minHeight: 48 }}
          onClick={() => {
            if (!product) return
            setBusy(true)
            void ws.setStock(product, { add: amount }).then((done) => {
              setBusy(false)
              if (done) onDone()
            })
          }}
        >
          {copy.made(amount)}
        </Button>
        <Button
          sx={{ minHeight: 48 }}
          data-uncounted
          onClick={() => {
            // Tomorrow's prep plan, with its numbers (Grow → How much to make).
            requestOpen('plan')
            ws.go('grow')
          }}
        >
          {copy.planTomorrow}
        </Button>
        <Button sx={{ minHeight: 48 }} data-uncounted onClick={onDone}>
          {copy.notNow}
        </Button>
      </Stack>
    </Stack>
  )
}
