import { useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  useMediaQuery,
} from '@mui/material'
import type { Business, Product, Proposal } from './api'
import { currencySymbol, shopCurrency, toMajor, toMinor } from './format'
import { useBackClose } from './backStack'
import { GuidedDetails, type GuidedResult } from './GuidedDetails'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { windowClass } from '../../design/theme'
import { useShopCopy } from '../shop/strings'
import { UNITS, unitKey } from '../shop/units'

const EMPTY: Business['fields'] = { name: '', category: '', location: '', hours: '', phone: '' }

function useCompact() {
  return useMediaQuery(`(max-width:${windowClass.medium - 1}px)`)
}

export function BusinessDialog() {
  const { editor } = useWorkspace()
  if (editor.kind !== 'business') return null
  // Keyed so each open starts from the shop's current saved fields.
  return (
    <BusinessForm
      key={JSON.stringify(editor.fields)}
      initial={editor.fields ?? { ...EMPTY, currency: shopCurrency(null) }}
    />
  )
}

function BusinessForm({ initial }: { initial: Business['fields'] }) {
  const t = useCopy()
  const { api, active, editor, openEditor, review } = useWorkspace()
  const [error, setError] = useState('')
  // One request at a time: repeated taps must not create competing proposals.
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const editing = editor.kind === 'business' && editor.fields !== null
  const close = () => openEditor({ kind: 'none' })
  // Back closes the journey; typed changes ask "Discard changes?" first.
  useBackClose(true, close, dirty)
  async function submit({ fields, products, location }: GuidedResult) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const proposal = await api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'business',
          business_id: editing ? active?.id : null,
          revision: editing ? (active?.revision ?? 0) : 0,
          business: fields,
          ...(editing ? {} : { products }),
          owner_location: location,
        }),
      })
      openEditor({ kind: 'none' })
      review(proposal)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.actionFailed)
    } finally {
      setBusy(false)
    }
  }
  // Full screen on every size: a guided journey, one question per screen.
  return (
    <Dialog open fullScreen onClose={close} aria-labelledby="business-form-title">
      <GuidedDetails
        mode={editing ? 'edit' : 'new'}
        initial={initial}
        startStep={editor.kind === 'business' ? editor.step : undefined}
        busy={busy}
        error={error}
        titleId="business-form-title"
        onCancel={close}
        onSubmit={(result) => void submit(result)}
        onDirty={setDirty}
      />
    </Dialog>
  )
}

export function ProductDialog() {
  const { editor } = useWorkspace()
  if (editor.kind !== 'product') return null
  return <ProductForm key={editor.product?.id ?? 'new'} product={editor.product} />
}

function ProductForm({ product }: { product: Product | null }) {
  const t = useCopy()
  const shopCopy = useShopCopy()
  const { api, active, openEditor, review } = useWorkspace()
  const compact = useCompact()
  const currency = shopCurrency(active)
  const [initial] = useState(() => ({
    name: product?.name ?? '',
    price: product ? String(toMajor(product.price, currency)) : '',
    // A known legacy spelling ("pcs") opens as its unit; other free text stays until replaced.
    unit: product ? (unitKey(product.unit) ?? product.unit) : 'item',
    stock: product?.stock == null ? '' : String(product.stock),
    category: product?.category ?? '',
  }))
  const [item, setItem] = useState(initial)
  const close = () => openEditor({ kind: 'none' })
  useBackClose(true, close, JSON.stringify(item) !== JSON.stringify(initial))
  const [error, setError] = useState('')
  // One request at a time: repeated taps must not create competing proposals.
  const [busy, setBusy] = useState(false)
  const price = Number(item.price)
  async function submit() {
    if (!item.name.trim()) return setError(t.enterName)
    if (!item.price.trim() || !Number.isFinite(price) || price < 0) return setError(t.enterPrice)
    if (!active || busy) return
    setBusy(true)
    try {
      const proposal = await api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'inventory',
          business_id: active.id,
          revision: active.revision,
          products: [
            {
              name: item.name.trim(),
              price: toMinor(price, currency),
              unit: item.unit,
              // A new unit for a saved item changes that item instead of adding a copy.
              ...(product && product.unit !== item.unit ? { previous_unit: product.unit } : {}),
              stock: item.stock.trim() ? Number(item.stock) : null,
              category: item.category.trim(),
              available: product?.available ?? true,
            },
          ],
        }),
      })
      openEditor({ kind: 'none' })
      review(proposal)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.actionFailed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open fullScreen={compact} onClose={close} aria-labelledby="product-form-title">
      <DialogTitle id="product-form-title">{product ? t.editProduct : t.addProduct}</DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          spacing={3}
          sx={{ pt: 1 }}
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <TextField
            label={t.productName}
            value={item.name}
            required
            autoFocus
            onChange={(event) => setItem({ ...item, name: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 180 } }}
          />
          <TextField
            label={t.price}
            value={item.price}
            required
            inputMode="decimal"
            onChange={(event) => setItem({ ...item, price: event.target.value })}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">{currencySymbol(currency)}</InputAdornment>
                ),
              },
              htmlInput: { inputMode: 'decimal' },
            }}
          />
          <TextField
            select
            label={shopCopy.unit}
            name="unit"
            value={item.unit}
            onChange={(event) => setItem({ ...item, unit: event.target.value })}
          >
            {!unitKey(item.unit) && (
              <MenuItem value={item.unit}>{shopCopy.unitCurrent(item.unit)}</MenuItem>
            )}
            {UNITS.map((unit) => (
              <MenuItem key={unit} value={unit}>
                {shopCopy.units[unit]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={shopCopy.category}
            name="category"
            value={item.category}
            onChange={(event) => setItem({ ...item, category: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          <TextField
            label={t.stockOptional}
            value={item.stock}
            onChange={(event) => setItem({ ...item, stock: event.target.value.replace(/\D/g, '') })}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
          {error && <Alert severity="error">{error}</Alert>}
          <button type="submit" hidden />
        </Stack>
      </DialogContent>
      {/* Docked: Save and Cancel stay in the thumb zone while the fields scroll. */}
      <DialogActions
        data-testid="product-actions"
        sx={{
          position: 'sticky',
          bottom: 0,
          flexShrink: 0,
          px: 3,
          py: 2,
          gap: 2,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Button onClick={close} sx={{ minHeight: 48 }}>
          {t.cancel}
        </Button>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void submit()}
          sx={{ minHeight: 48 }}
        >
          {t.reviewFirst}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
