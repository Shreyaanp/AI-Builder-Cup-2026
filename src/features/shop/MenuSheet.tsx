import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  InputAdornment,
  InputBase,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Plus, X } from 'lucide-react'
import { shape } from '../../design/theme'
import type { Product, Proposal } from '../v1/api'
import { currencySymbol, formatPrice, shopCurrency, toMajor, toMinor } from '../v1/format'
import { ImportButton, ImportPanel, SalesImportSheet } from '../v1/ImportMenu'
import { Sheet } from '../v1/Sheet'
import { useCopy } from '../v1/strings'
import { useImport, type SalesImport } from '../v1/useImport'
import { useWorkspace } from '../v1/workspaceContext'
import { groupProducts } from './groupProducts'
import { categoryLabel, useShopCopy } from './strings'
import { unitLabel } from './units'

/**
 * The full menu: one section per category, each a grid of compact item cards (two per row on
 * a phone, three or more when wider). Tap a name to edit the item, tap a price to change it in
 * place. Import and Add product share one compact row of actions.
 */
export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useCopy()
  const copy = useShopCopy()
  const ws = useWorkspace()
  const [sales, setSales] = useState<SalesImport | null>(null)
  const [importing, setImporting] = useState(false)
  const [sorting, setSorting] = useState(false)
  const importer = useImport({ onBeforeReview: onClose, onSales: setSales })
  const shop = ws.active
  if (!shop) return null
  const unsorted = ws.products.filter((product) => !product.category?.trim()).length

  async function sortMenu() {
    if (!shop || sorting) return
    setSorting(true)
    try {
      // A proposal like any other: the review shows every suggested category before saving.
      const proposal = await ws.api<Proposal>(
        `/businesses/${encodeURIComponent(shop.id)}/sort-menu`,
        { method: 'POST' },
      )
      onClose()
      ws.review(proposal)
    } catch {
      ws.notify(t.actionFailed)
    } finally {
      setSorting(false)
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        titleId="menu-sheet-title"
        title={t.menu}
        actions={
          <Stack direction="row" sx={{ gap: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <ImportButton
              expanded={importing}
              busy={importer.busy}
              onToggle={() => setImporting((value) => !value)}
            />
            <Button
              variant="contained"
              startIcon={<Plus size={18} />}
              onClick={() => {
                // Editors are their own dialogs; close the sheet first so modals never stack.
                onClose()
                ws.openEditor({ kind: 'product', product: null })
              }}
            >
              {t.addProduct}
            </Button>
          </Stack>
        }
      >
        {importing && <ImportPanel importer={importer} />}
        {unsorted > 0 && (
          <Alert
            severity="info"
            sx={{ mb: 4, alignItems: 'center' }}
            action={
              <Button
                color="inherit"
                disabled={sorting}
                startIcon={sorting ? <CircularProgress size={16} /> : undefined}
                onClick={() => void sortMenu()}
              >
                {copy.sortMenu}
              </Button>
            }
          >
            {copy.sortHint(unsorted)}
          </Alert>
        )}
        {ws.products.length === 0 ? (
          <Typography variant="bodyMedium" color="text.secondary">
            {t.productsEmpty}
          </Typography>
        ) : (
          <Stack spacing={5}>
            {groupProducts(ws.products).map((group, index) => (
              <Box
                component="section"
                key={group.category || 'uncategorised'}
                aria-labelledby={`menu-group-${index}`}
              >
                <Typography
                  id={`menu-group-${index}`}
                  component="h3"
                  variant="titleSmall"
                  sx={{ mb: 2, color: 'text.secondary', overflowWrap: 'anywhere' }}
                >
                  {categoryLabel(group.category, copy)}
                </Typography>
                <Box
                  component="ul"
                  sx={{
                    m: 0,
                    p: 0,
                    listStyle: 'none',
                    display: 'grid',
                    // Two per row on a phone sheet, three or more when the sheet is wider.
                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 148px), 1fr))',
                    gap: 2,
                  }}
                >
                  {group.items.map((product) => (
                    <ItemCard
                      key={product.id ?? `${product.name}-${product.unit}`}
                      product={product}
                      onEdit={() => {
                        onClose()
                        ws.openEditor({ kind: 'product', product })
                      }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Sheet>
      <SalesImportSheet imported={sales} onClose={() => setSales(null)} />
    </>
  )
}

function ItemCard({ product, onEdit }: { product: Product; onEdit: () => void }) {
  const t = useCopy()
  const copy = useShopCopy()
  const roles = useTheme().material
  const soldOut = product.available === false
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 1,
        minWidth: 0,
        p: 2,
        borderRadius: `${shape.md}px`,
        bgcolor: soldOut ? roles.surfaceContainerLowest : roles.surfaceContainer,
        border: `1px solid ${soldOut ? roles.outlineVariant : 'transparent'}`,
      }}
    >
      <ButtonBase
        onClick={onEdit}
        aria-label={`${t.editProduct} ${product.name}`}
        sx={{
          display: 'block',
          textAlign: 'start',
          borderRadius: `${shape.sm}px`,
          minHeight: 48,
          px: 1,
          '&:focus-visible': { outline: `2px solid ${roles.primary}` },
        }}
      >
        <Typography
          component="span"
          variant="bodyLarge"
          sx={{
            display: 'block',
            fontWeight: 500,
            overflowWrap: 'anywhere',
            color: soldOut ? roles.onSurfaceVariant : roles.onSurface,
          }}
        >
          {product.name}
        </Typography>
        <Typography component="span" variant="bodySmall" color="text.secondary">
          {unitLabel(product.unit, copy)}
        </Typography>
      </ButtonBase>
      {soldOut && (
        <Chip
          size="small"
          label={t.soldOut}
          sx={{
            alignSelf: 'flex-start',
            ml: 1,
            bgcolor: roles.errorContainer,
            color: roles.onErrorContainer,
          }}
        />
      )}
      <PriceField product={product} />
    </Box>
  )
}

type PriceState =
  | { mode: 'view' }
  | { mode: 'edit'; text: string; error: boolean }
  | { mode: 'busy' }
  | { mode: 'confirm'; proposal: Proposal; price: number }

/**
 * Tap the price to change it in place: a numeric keypad on phones, Enter or leaving the field
 * prepares the change, Esc cancels. The owner then confirms the exact sealed proposal with one
 * tap ("Save S$2.20"), the same rule as every other change.
 */
function PriceField({ product }: { product: Product }) {
  const t = useCopy()
  const copy = useShopCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [state, setState] = useState<PriceState>({ mode: 'view' })
  const shop = ws.active
  const currency = shopCurrency(shop)
  const shown = formatPrice(product.price, currency)

  async function prepare(text: string) {
    const value = Number(text.trim().replace(',', '.'))
    if (!text.trim() || !Number.isFinite(value) || value < 0) {
      setState({ mode: 'edit', text, error: true })
      return
    }
    const price = toMinor(value, currency)
    if (price === product.price || !shop) {
      setState({ mode: 'view' })
      return
    }
    setState({ mode: 'busy' })
    try {
      const proposal = await ws.api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'inventory',
          business_id: shop.id,
          revision: shop.revision,
          products: [
            {
              name: product.name,
              price,
              unit: product.unit,
              stock: product.stock ?? null,
              available: product.available ?? true,
              ...(product.category ? { category: product.category } : {}),
            },
          ],
        }),
      })
      setState({ mode: 'confirm', proposal, price })
    } catch {
      ws.notify(t.actionFailed)
      setState({ mode: 'view' })
    }
  }

  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    // Esc cancels the edit only; the sheet stays open.
    event.stopPropagation()
    setState({ mode: 'view' })
  }

  if (state.mode === 'edit')
    return (
      <Box sx={{ px: 1 }}>
        <InputBase
          autoFocus
          value={state.text}
          onChange={(event) => setState({ mode: 'edit', text: event.target.value, error: false })}
          onKeyDown={(event) => {
            cancelOnEscape(event)
            if (event.key === 'Enter') {
              event.preventDefault()
              void prepare(state.text)
            }
          }}
          onBlur={() => void prepare(state.text)}
          startAdornment={
            <InputAdornment position="start" sx={{ mr: 0.5 }}>
              {currencySymbol(currency)}
            </InputAdornment>
          }
          inputProps={{
            'aria-label': copy.editPrice(product.name),
            'aria-invalid': state.error,
            'aria-describedby': state.error ? `price-error-${product.id}` : undefined,
            inputMode: 'decimal',
            enterKeyHint: 'done',
            autoComplete: 'off',
            name: 'price',
          }}
          sx={{
            width: '100%',
            minHeight: 48,
            px: 2,
            borderRadius: `${shape.sm}px`,
            bgcolor: roles.surfaceContainerHighest,
            fontSize: '1rem',
            fontVariantNumeric: 'tabular-nums',
            outline: `2px solid ${state.error ? roles.error : roles.primary}`,
          }}
        />
        {state.error && (
          <Typography
            id={`price-error-${product.id}`}
            variant="bodySmall"
            sx={{ display: 'block', mt: 1, color: roles.error }}
          >
            {copy.priceInvalid}
          </Typography>
        )}
      </Box>
    )

  if (state.mode === 'confirm')
    return (
      // Stacked so a long price ("Simpan RM12.50", "Rp 25.000") stays on one line.
      <Stack sx={{ gap: 1 }} onKeyDown={cancelOnEscape}>
        <Button
          variant="contained"
          size="small"
          autoFocus
          fullWidth
          onClick={() => {
            setState({ mode: 'busy' })
            ws.confirm(state.proposal)
              .then(() => setState({ mode: 'view' }))
              .catch(() => {
                ws.notify(t.actionFailed)
                setState({ mode: 'view' })
              })
          }}
          sx={{ minHeight: 40, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
        >
          {copy.savePrice(formatPrice(state.price, currency))}
        </Button>
        <Button
          size="small"
          startIcon={<X size={16} />}
          onClick={() => setState({ mode: 'view' })}
          sx={{ minHeight: 40 }}
        >
          {t.cancel}
        </Button>
      </Stack>
    )

  return (
    <ButtonBase
      disabled={state.mode === 'busy'}
      onClick={() =>
        setState({ mode: 'edit', text: String(toMajor(product.price, currency)), error: false })
      }
      // The name says what the button does; the visible price stays part of it.
      aria-label={`${copy.editPrice(product.name)}, ${shown}`}
      sx={{
        alignSelf: 'flex-start',
        minHeight: 48,
        px: 1,
        gap: 1,
        borderRadius: `${shape.sm}px`,
        '&:focus-visible': { outline: `2px solid ${roles.primary}` },
      }}
    >
      <Typography
        component="span"
        variant="titleMedium"
        sx={{
          fontVariantNumeric: 'tabular-nums',
          color: roles.primary,
          textDecoration: 'underline dotted',
          textUnderlineOffset: '4px',
        }}
      >
        {shown}
      </Typography>
      {state.mode === 'busy' && <CircularProgress size={16} aria-label={t.loading} />}
    </ButtonBase>
  )
}
