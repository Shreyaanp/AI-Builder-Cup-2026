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
import { CURRENCIES, currencySymbol, shopCurrency, toMajor, toMinor } from './format'
import { useBackClose } from './backStack'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { windowClass } from '../../design/theme'
import { useRewardCopy } from '../rewards/strings'
import { HoursEditor } from '../shop/Hours'
import { useShopCopy } from '../shop/strings'

const EMPTY: Business['fields'] = { name: '', category: '', location: '', hours: '', phone: '' }

// Shop currency picker: the phone region's currency first, then the APAC list.
function currencyOptions(current: string) {
  return [current, ...CURRENCIES.filter((code) => code !== current)]
}

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
  const rewards = useRewardCopy()
  const shopCopy = useShopCopy()
  const { api, active, editor, openEditor, review } = useWorkspace()
  const compact = useCompact()
  const [fields, setFields] = useState(initial)
  const [error, setError] = useState('')
  // One request at a time: repeated taps must not create competing proposals.
  const [busy, setBusy] = useState(false)
  const editing = editor.kind === 'business' && editor.fields !== null
  const close = () => openEditor({ kind: 'none' })
  // Back closes the form; typed changes ask "Discard changes?" first.
  useBackClose(true, close, JSON.stringify(fields) !== JSON.stringify(initial))
  async function submit() {
    if (busy) return
    if (!fields.name.trim()) {
      setError(t.enterName)
      return
    }
    setBusy(true)
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
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open fullScreen={compact} onClose={close} aria-labelledby="business-form-title">
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
          {(Object.keys(t.fields) as (keyof typeof t.fields)[])
            .filter((key) => key !== 'hours')
            .map((key) => (
              <TextField
                key={key}
                label={t.fields[key]}
                value={fields[key]}
                required={key === 'name'}
                autoFocus={key === 'name'}
                type={key === 'phone' ? 'tel' : 'text'}
                autoComplete={
                  key === 'phone' ? 'tel' : key === 'location' ? 'street-address' : 'off'
                }
                onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
                slotProps={{ htmlInput: { maxLength: key === 'location' ? 300 : 180 } }}
              />
            ))}
          <HoursEditor
            value={fields.weekly_hours ?? []}
            onChange={(weekly_hours) => setFields({ ...fields, weekly_hours })}
          />
          {/* Free text stays for what a schedule can't say (holidays, "until sold out"). */}
          <TextField
            label={shopCopy.hoursNote}
            value={fields.hours}
            autoComplete="off"
            onChange={(event) => setFields({ ...fields, hours: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 180 } }}
          />
          <TextField
            label={rewards.reward}
            name="reward_text"
            value={fields.reward_text ?? ''}
            helperText={rewards.rewardHelp}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            onChange={(event) => setFields({ ...fields, reward_text: event.target.value })}
          />
          <TextField
            select
            label={t.currency}
            value={fields.currency ?? 'SGD'}
            // Stored prices are in this currency's minor units, so it is fixed once saved.
            disabled={editing}
            helperText={editing ? t.currencyLocked : undefined}
            // The reason it is locked must stay readable (AA), not greyed out like the field.
            slotProps={{
              formHelperText: { sx: { '&.Mui-disabled': { color: 'text.secondary' } } },
            }}
            onChange={(event) => setFields({ ...fields, currency: event.target.value })}
          >
            {currencyOptions(fields.currency ?? 'SGD').map((code) => (
              <MenuItem key={code} value={code}>
                {code} · {currencySymbol(code)}
              </MenuItem>
            ))}
          </TextField>
          {error && <Alert severity="error">{error}</Alert>}
          <button type="submit" hidden />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={close}>{t.cancel}</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>
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
  const shopCopy = useShopCopy()
  const { api, active, openEditor, review } = useWorkspace()
  const compact = useCompact()
  const currency = shopCurrency(active)
  const [initial] = useState(() => ({
    name: product?.name ?? '',
    price: product ? String(toMajor(product.price, currency)) : '',
    unit: product?.unit ?? 'item',
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
              unit: item.unit.trim() || 'item',
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
            label={t.unit}
            value={item.unit}
            onChange={(event) => setItem({ ...item, unit: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 40 } }}
          />
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
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={close}>{t.cancel}</Button>
        <Button variant="contained" disabled={busy} onClick={() => void submit()}>
          {t.reviewFirst}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
