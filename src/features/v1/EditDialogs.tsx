import { useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField,
  useMediaQuery,
} from '@mui/material'
import type { Business, Product, Proposal } from './api'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { windowClass } from '../../design/theme'

const EMPTY: Business['fields'] = { name: '', category: '', location: '', hours: '', phone: '' }

function useCompact() {
  return useMediaQuery(`(max-width:${windowClass.medium - 1}px)`)
}

export function BusinessDialog() {
  const { editor } = useWorkspace()
  if (editor.kind !== 'business') return null
  // Keyed so each open starts from the shop's current saved fields.
  return <BusinessForm key={JSON.stringify(editor.fields)} initial={editor.fields ?? EMPTY} />
}

function BusinessForm({ initial }: { initial: Business['fields'] }) {
  const t = useCopy()
  const { api, active, editor, openEditor, review } = useWorkspace()
  const compact = useCompact()
  const [fields, setFields] = useState(initial)
  const [error, setError] = useState('')
  const editing = editor.kind === 'business' && editor.fields !== null
  async function submit() {
    if (!fields.name.trim()) {
      setError(t.enterName)
      return
    }
    try {
      const proposal = await api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'business',
          business_id: editing ? active?.id : null,
          revision: editing ? (active?.revision ?? 0) : 0,
          business: fields,
        }),
      })
      openEditor({ kind: 'none' })
      review(proposal)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.actionFailed)
    }
  }
  return (
    <Dialog
      open
      fullScreen={compact}
      onClose={() => openEditor({ kind: 'none' })}
      aria-labelledby="business-form-title"
    >
      <DialogTitle id="business-form-title">{editing ? t.editDetails : t.addShop}</DialogTitle>
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
          {(Object.keys(t.fields) as (keyof typeof t.fields)[]).map((key) => (
            <TextField
              key={key}
              label={t.fields[key]}
              value={fields[key]}
              required={key === 'name'}
              autoFocus={key === 'name'}
              type={key === 'phone' ? 'tel' : 'text'}
              autoComplete={key === 'phone' ? 'tel' : key === 'location' ? 'street-address' : 'off'}
              onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
              slotProps={{ htmlInput: { maxLength: key === 'location' ? 300 : 180 } }}
            />
          ))}
          {error && <Alert severity="error">{error}</Alert>}
          <button type="submit" hidden />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={() => openEditor({ kind: 'none' })}>{t.cancel}</Button>
        <Button variant="contained" onClick={() => void submit()}>
          {t.reviewFirst}
        </Button>
      </DialogActions>
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
  const { api, active, openEditor, review } = useWorkspace()
  const compact = useCompact()
  const [item, setItem] = useState({
    name: product?.name ?? '',
    price: product ? String(product.price / 100) : '',
    unit: product?.unit ?? 'item',
    stock: product?.stock == null ? '' : String(product.stock),
  })
  const [error, setError] = useState('')
  const price = Number(item.price)
  async function submit() {
    if (!item.name.trim()) return setError(t.enterName)
    if (!item.price.trim() || !Number.isFinite(price) || price < 0) return setError(t.enterPrice)
    if (!active) return
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
              price: Math.round(price * 100),
              unit: item.unit.trim() || 'item',
              stock: item.stock.trim() ? Number(item.stock) : null,
            },
          ],
        }),
      })
      openEditor({ kind: 'none' })
      review(proposal)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.actionFailed)
    }
  }
  return (
    <Dialog
      open
      fullScreen={compact}
      onClose={() => openEditor({ kind: 'none' })}
      aria-labelledby="product-form-title"
    >
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
              input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
              htmlInput: { inputMode: 'decimal' },
            }}
          />
          <TextField
            label={t.unit}
            value={item.unit}
            onChange={(event) => setItem({ ...item, unit: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 40 } }}
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
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={() => openEditor({ kind: 'none' })}>{t.cancel}</Button>
        <Button variant="contained" onClick={() => void submit()}>
          {t.reviewFirst}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
