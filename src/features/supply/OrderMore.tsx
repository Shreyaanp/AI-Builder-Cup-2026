import { Suspense, useRef, useState, type FormEvent } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { Mic, ShoppingBasket } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { productFeminine, productName } from '../../i18n/productNames'
import { useGrowCopy } from '../v1/growCopy'
import { Sheet } from '../v1/Sheet'
import { useTodayCopy } from '../v1/today/todayCopy'
import { useTwoPathsCopy } from '../v1/twoPathsCopy'
import { requestOpen } from '../v1/openRequest'
import { useWorkspace } from '../v1/workspaceContext'
import { unitChoices, useReadAmount } from './amount'
import { useOrderChangeCopy } from './orderChangeCopy'
import { useOrderMoreCopy } from './orderMoreCopy'
import { PurchaseOrderCard } from './supplyDeferred'
import { useDraftReorder, useOrderText, type OrderAsk } from './supplyData'
import type { PurchaseOrder } from './types'
import { useOrderUnit } from './unitLabel'

/** "How much?": the amount to suggest, the unit, then the order itself. Nothing goes yet. */
export function HowMuch({
  ask,
  onOrder,
  onCancel,
}: {
  ask: OrderAsk
  onOrder: (order: PurchaseOrder) => void
  onCancel?: () => void
}) {
  const c = useOrderMoreCopy()
  const change = useOrderChangeCopy()
  const locale = useLocale()
  const unit = useOrderUnit()
  const draft = useDraftReorder()
  const read = useReadAmount()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const choices = unitChoices(ask.unit)
  const [text, setText] = useState(ask.suggested != null ? String(ask.suggested) : '')
  const [picked, setPicked] = useState(choices[0]!)
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const name = productName(ask.item, locale)
  async function submit(event: FormEvent) {
    event.preventDefault()
    const quantity = read(text)
    if (quantity === null) {
      setWrong(true)
      return
    }
    setWrong(false)
    setBusy(true)
    setNote('')
    const result = await draft(ask.item, false, { quantity, unit: picked, direct: true })
    setBusy(false)
    if (result.order) onOrder(result.order)
    else setNote(result.note)
  }
  return (
    <Stack
      component="form"
      noValidate
      spacing={3}
      data-testid="how-much"
      onSubmit={(event) => void submit(event)}
    >
      <Typography variant="titleMedium" component="h3" sx={{ overflowWrap: 'anywhere' }}>
        {c.howMuch(name)}
      </Typography>
      {ask.suggested != null && (
        <Typography variant="bodyMedium" color="text.secondary">
          {c.suggested(`${number.format(ask.suggested)} ${unit(choices[0]!)}`)}
        </Typography>
      )}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <TextField
          autoFocus
          label={c.amount}
          value={text}
          error={wrong}
          helperText={wrong ? c.enterAmount : undefined}
          onChange={(event) => setText(event.target.value)}
          slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 12 } }}
          sx={{ flex: 1, minWidth: 0 }}
        />
        <TextField
          select
          label={c.unit}
          value={picked}
          onChange={(event) => setPicked(event.target.value)}
          sx={{ width: 112, flexShrink: 0 }}
        >
          {choices.map((choice) => (
            <MenuItem key={choice} value={choice} sx={{ minHeight: 48 }}>
              {unit(choice)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {note && (
        <Typography role="status" variant="bodyLarge">
          {note}
        </Typography>
      )}
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
        {onCancel && (
          <Button onClick={onCancel} sx={{ minHeight: 48 }}>
            {change.notNow}
          </Button>
        )}
        <Button
          type="submit"
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 48, px: 5 }}
        >
          {c.seeOrder}
        </Button>
      </Stack>
    </Stack>
  )
}

/** The same "how much?" from Home, as its own sheet; the order card opens in it. */
export function OrderMoreSheet({ ask, onClose }: { ask: OrderAsk | null; onClose: () => void }) {
  const change = useOrderChangeCopy()
  const grow = useGrowCopy()
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const close = () => {
    setOrder(null)
    onClose()
  }
  return (
    <Sheet
      open={ask !== null}
      onClose={close}
      titleId="order-more-title"
      title={order ? grow.stock : change.orderMore}
    >
      {order ? (
        <Suspense fallback={null}>
          <PurchaseOrderCard order={order} onChange={setOrder} />
        </Suspense>
      ) : (
        ask && <HowMuch key={ask.item} ask={ask} onOrder={setOrder} />
      )}
    </Sheet>
  )
}

/**
 * The Buy stock box (Priya, 8 Nov): "butter, 2 kg", typed or said, even when the app thinks
 * nothing is needed. What was heard stays in the box to check before Order is tapped.
 */
export function OrderBox({
  onOrder,
  onAsk,
  onLeave,
}: {
  onOrder: (order: PurchaseOrder) => void
  onAsk: (ask: OrderAsk) => void
  /** The sheet closes: the coach is listening instead. */
  onLeave: () => void
}) {
  const c = useOrderMoreCopy()
  const ws = useWorkspace()
  const paths = useTwoPathsCopy()
  const grow = useGrowCopy()
  const send = useOrderText()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const field = useRef<HTMLInputElement>(null)
  // Said, not typed: the coach's own voice, which drafts the same order (shared voice rule).
  function talk() {
    requestOpen('talk')
    onLeave()
    ws.go('coach')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) {
      field.current?.focus()
      return
    }
    setBusy(true)
    setNote('')
    const result = await send(text.trim())
    setBusy(false)
    setNote(result.note)
    if (result.ask) onAsk(result.ask)
    else if (result.order) onOrder(result.order)
    if (result.ask || result.order || result.done) setText('')
  }
  return (
    <Stack
      component="form"
      noValidate
      spacing={2}
      role="search"
      aria-label={grow.stock}
      data-testid="order-box"
      onSubmit={(event) => void submit(event)}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <TextField
          inputRef={field}
          fullWidth
          name="order-text"
          label={paths.supplierNeed}
          helperText={c.boxExample}
          value={text}
          onChange={(event) => setText(event.target.value)}
          slotProps={{
            htmlInput: { maxLength: 200, autoComplete: 'off' },
            // Never under the mic while it rests inside the box.
            inputLabel: {
              sx: { '&:not(.MuiInputLabel-shrink)': { maxWidth: 'calc(100% - 72px)' } },
            },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    aria-label={c.say}
                    onClick={talk}
                    sx={{ width: 48, height: 48 }}
                  >
                    <Mic size={20} />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          type="submit"
          variant="contained"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 56, flexShrink: 0, px: 3 }}
        >
          {grow.order}
        </Button>
      </Stack>
      {note && (
        <Typography role="status" variant="bodyLarge">
          {note}
        </Typography>
      )}
    </Stack>
  )
}

/** Sold out or low, with nothing on its way: one row each, each with Order more. */
export function ToOrderRows({ asks, onAsk }: { asks: OrderAsk[]; onAsk: (ask: OrderAsk) => void }) {
  const tt = useTodayCopy()
  const change = useOrderChangeCopy()
  const locale = useLocale()
  const roles = useTheme().material
  if (!asks.length) return null
  return (
    <Stack component="ul" spacing={1} data-testid="to-order" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {asks.map((ask) => {
        const name = productName(ask.item, locale)
        return (
          <Box
            component="li"
            key={ask.item}
            data-item={ask.item}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: 2,
              rowGap: 1,
              minHeight: 56,
              px: 3,
              py: 1,
              borderRadius: 2,
              bgcolor: roles.surfaceContainer,
            }}
          >
            <Typography
              variant="bodyLarge"
              sx={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {ask.sold_out
                ? tt.soldOut(name, productFeminine(ask.item, locale))
                : tt.low(name, ask.left ?? 0)}
            </Typography>
            <Button
              variant="outlined"
              startIcon={<ShoppingBasket size={18} />}
              aria-label={`${change.orderMore} ${name}`}
              onClick={() => onAsk(ask)}
              sx={{ minHeight: 48, ml: 'auto' }}
            >
              {change.orderMore}
            </Button>
          </Box>
        )
      })}
    </Stack>
  )
}
