import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
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
import { currencySymbol, formatShopPrice, shopCurrency, toMajor, toMinor } from '../v1/format'
import { ImportButton, ImportPanel, SalesImportSheet } from '../v1/ImportMenu'
import { Sheet } from '../v1/Sheet'
import { useCopy } from '../v1/strings'
import { useImport, type SalesImport } from '../v1/useImport'
import { useWorkspace } from '../v1/workspaceContext'
import { groupProducts } from './groupProducts'
import { categoryLabel, useShopCopy } from './strings'
import { unitLabel } from './units'
import { onMenu, useUsualSales } from './stock'
import { StockLine } from './stockLine'
import { StockNote } from './StockNote'
import { useStockCopy } from './stockCopy'

/**
 * The full menu: one section per category, each a grid of item cards (one per row on a phone so
 * the stock and its − / + fit, two or more when wider). Tap a name to edit the item, tap a price to change it in
 * place. Import and Add product share one compact row of actions.
 */
export function MenuSheet({
  open,
  onClose,
  focus = null,
  onThingsIBuy,
}: {
  open: boolean
  onClose: () => void
  /** Move focus to this item when the sheet opens. */
  focus?: string | null
  /** Opens "Things I buy" (OB-310). */
  onThingsIBuy?: () => void
}) {
  const t = useCopy()
  const copy = useShopCopy()
  const stock = useStockCopy()
  const roles = useTheme().material
  const ws = useWorkspace()
  const [sales, setSales] = useState<SalesImport | null>(null)
  const [importing, setImporting] = useState(false)
  const [sorting, setSorting] = useState(false)
  const importer = useImport({ onBeforeReview: onClose, onSales: setSales })
  const usual = useUsualSales(open)
  const shop = ws.active
  if (!shop) return null
  // What customers can buy; tea dust and milk the shop buys have their own list (OB-310).
  const menu = ws.products.filter(onMenu)
  const bought = ws.products.length - menu.length
  const unsorted = menu.filter((product) => !product.category?.trim()).length

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
        ask="add_menu"
        title={t.menu}
        onEntered={() => {
          if (!focus) return
          const item = Array.from(document.querySelectorAll<HTMLElement>('[data-menu-item]')).find(
            (element) => element.dataset.menuItem === focus,
          )
          item?.scrollIntoView({ block: 'center' })
          item?.focus()
        }}
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
        {open && <StockNote inSheet />}
        {importing && (
          <ImportPanel
            importer={importer}
            onTypeItems={() => {
              onClose()
              ws.openEditor({ kind: 'product', product: null })
            }}
          />
        )}
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
        {menu.length === 0 ? (
          <Typography variant="bodyMedium" color="text.secondary">
            {t.productsEmpty}
          </Typography>
        ) : (
          <Stack spacing={5}>
            {groupProducts(menu).map((group, index) => (
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
                    // One per row on a phone, so the count and its − / + fit beside each other;
                    // two or more when the sheet is wider.
                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
                    gap: 2,
                  }}
                >
                  {group.items.map((product) => (
                    <ItemCard
                      key={product.id ?? `${product.name}-${product.unit}`}
                      product={product}
                      usual={usual?.items[product.name]}
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
        {bought > 0 && onThingsIBuy && (
          <ButtonBase
            onClick={onThingsIBuy}
            aria-haspopup="dialog"
            sx={{
              mt: 4,
              width: '100%',
              minHeight: 56,
              px: 2,
              gap: 2,
              justifyContent: 'space-between',
              borderRadius: `${shape.md}px`,
              border: `1px solid ${roles.outlineVariant}`,
              '&:focus-visible': { outline: `2px solid ${roles.primary}` },
            }}
          >
            <Typography component="span" variant="bodyLarge" sx={{ textAlign: 'start' }}>
              {stock.thingsIBuy}
            </Typography>
            <Typography component="span" variant="bodyMedium" color="text.secondary">
              {stock.thingsIBuyCount(bought)}
            </Typography>
          </ButtonBase>
        )}
      </Sheet>
      <SalesImportSheet imported={sales} onClose={() => setSales(null)} />
    </>
  )
}

/** One item: name and price on top, its stock with − / + below (OB-310). */
export function ItemCard({
  product,
  usual,
  onEdit,
  priced = true,
}: {
  product: Product
  usual?: number
  onEdit: () => void
  /** "Things I buy" have no customer price to change in place. */
  priced?: boolean
}) {
  const t = useCopy()
  const copy = useShopCopy()
  const roles = useTheme().material
  const soldOut = product.available === false
  return (
    <Box
      component="li"
      data-menu-card={product.name}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minWidth: 0,
        p: 2,
        borderRadius: `${shape.md}px`,
        bgcolor: soldOut ? roles.surfaceContainerLowest : roles.surfaceContainer,
        border: `1px solid ${soldOut ? roles.outlineVariant : 'transparent'}`,
      }}
    >
      {/* Wraps, so the in-place price editor drops below a long name instead of squeezing it. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 1 }}>
        <ButtonBase
          onClick={onEdit}
          data-menu-item={product.name}
          aria-label={`${t.editProduct} ${product.name}`}
          sx={{
            display: 'block',
            flex: '1 1 120px',
            minWidth: 0,
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
          <Typography component="span" variant="bodyMedium" color="text.secondary">
            {unitLabel(product.unit, copy)}
          </Typography>
        </ButtonBase>
        {priced && <PriceField product={product} />}
      </Box>
      {/* "Sold out" is the quiet count line, so Add product stays the one saturated action. */}
      <Box sx={{ pl: 1 }}>
        <StockLine product={product} usual={usual} />
      </Box>
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
  const shown = formatShopPrice(product.price, currency)

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
            variant="bodyMedium"
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
          sx={{ minHeight: 48, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
        >
          {copy.savePrice(formatShopPrice(state.price, currency))}
        </Button>
        <Button
          size="small"
          startIcon={<X size={16} />}
          onClick={() => setState({ mode: 'view' })}
          sx={{ minHeight: 48 }}
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
