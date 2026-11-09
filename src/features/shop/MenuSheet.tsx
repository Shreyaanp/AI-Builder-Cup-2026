import { useRef, useState } from 'react'
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
import { productName } from '../../i18n/productNames'
import { useLocale } from '../../state/hooks'
import { StockLine } from './stockLine'
import { openBuyStock } from '../supply/supplyEvents'
import { useSupply } from '../supply/supplyData'
import { useOrderChangeCopy } from '../supply/orderChangeCopy'
import { StockNote } from './StockNote'
import { useStockCopy } from './stockCopy'
import { moneyLocale } from '../../region/region'
import { readNumber } from '../v1/readNumber'
import { numberForEditing } from '../v1/format'
import { numberQuestion } from '../v1/numberCopy'

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
  const order = useOrderChangeCopy()
  const asks = new Set((useSupply(open).data?.to_order ?? []).map((ask) => ask.item))
  // Editors are their own dialogs and open once this sheet has gone: one mounted while it is still
  // sliding away came up hidden from screen readers (MUI's modal order), one time in four.
  const afterClose = useRef<(() => void) | null>(null)
  const thenOpen = (next: () => void) => {
    afterClose.current = next
    onClose()
  }
  const shop = ws.active
  if (!shop) return null
  // What customers can buy; tea dust and milk the shop buys have their own list (OB-310).
  const menu = ws.products.filter(onMenu)
  const bought = ws.products.length - menu.length
  const unsorted = menu.filter((product) => !product.category?.trim()).length
  // A bare supply name ("Paneer") stays on the menu; the owner is asked about one at a time.
  const asked = menu.find((product) => product.ask_for_sale)

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
        onExited={() => {
          const next = afterClose.current
          afterClose.current = null
          next?.()
        }}
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
              onClick={() => thenOpen(() => ws.openEditor({ kind: 'product', product: null }))}
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
            onTypeItems={() => thenOpen(() => ws.openEditor({ kind: 'product', product: null }))}
          />
        )}
        {asked && <AskForSale product={asked} />}
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
                      orderMore={
                        asks.has(product.name)
                          ? {
                              label: order.orderMore,
                              run: () => {
                                onClose()
                                openBuyStock(product.name)
                              },
                            }
                          : undefined
                      }
                      key={product.id ?? `${product.name}-${product.unit}`}
                      product={product}
                      usual={usual?.items[product.name]}
                      onEdit={() => thenOpen(() => ws.openEditor({ kind: 'product', product }))}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
        {bought > 0 && onThingsIBuy && (
          <ButtonBase
            onClick={() => {
              // A menu tap's note is about the menu: it never follows into Things I buy.
              ws.stockNote?.close()
              onThingsIBuy()
            }}
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

/**
 * "Do customers buy Paneer from you?" (OB-310): asked once for a bare supply name on a maker's
 * menu, saved on the item like the make-or-buy answer. Until then it stays on the menu.
 */
function AskForSale({ product }: { product: Product }) {
  const copy = useStockCopy()
  const ws = useWorkspace()
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  const answer = (forSale: boolean) => {
    setBusy(true)
    void ws.setForSale(product, forSale).finally(() => setBusy(false))
  }
  return (
    <Alert
      severity="info"
      icon={false}
      role="group"
      aria-labelledby="ask-for-sale"
      sx={{ mb: 4, '& .MuiAlert-message': { width: '100%' } }}
    >
      <Typography id="ask-for-sale" variant="bodyLarge" sx={{ fontWeight: 500 }}>
        {copy.askForSale(productName(product.name, locale))}
      </Typography>
      <Typography variant="bodyMedium" sx={{ display: 'block', mb: 2 }}>
        {copy.askForSaleHint}
      </Typography>
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          color="inherit"
          disabled={busy}
          onClick={() => answer(true)}
          sx={{ minHeight: 48 }}
        >
          {copy.yesSell}
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          disabled={busy}
          onClick={() => answer(false)}
          sx={{ minHeight: 48 }}
        >
          {copy.noSell}
        </Button>
      </Stack>
    </Alert>
  )
}

/** One item: name and price on top, its stock with − / + below (OB-310). */
export function ItemCard({
  product,
  usual,
  onEdit,
  priced = true,
  orderMore,
}: {
  product: Product
  usual?: number
  onEdit: () => void
  /** Sold out or low stock the shop buys: "Order more", right on the item. */
  orderMore?: { label: string; run: () => void }
  /** "Things I buy" have no customer price to change in place. */
  priced?: boolean
}) {
  const t = useCopy()
  const copy = useShopCopy()
  const roles = useTheme().material
  const locale = useLocale()
  // The same Hindi name the note, the − / + and the editor's title use (OB-74).
  const name = productName(product.name, locale)
  const soldOut = product.available === false || product.stock === 0
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
          aria-label={`${t.editProduct} ${name}`}
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
            {name}
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
      {orderMore && (
        <Button
          variant="outlined"
          aria-label={`${orderMore.label} ${name}`}
          onClick={orderMore.run}
          sx={{ alignSelf: 'flex-start', minHeight: 48 }}
        >
          {orderMore.label}
        </Button>
      )}
    </Box>
  )
}

type PriceState =
  | { mode: 'view' }
  /** `error`: what is wrong with the typed price, in words; '' when nothing is. */
  | { mode: 'edit'; text: string; error: string }
  | { mode: 'busy' }
  | { mode: 'confirm'; proposal: Proposal; price: number }

/**
 * Tap the price to change it in place: a numeric keypad on phones, Enter or leaving the field
 * prepares the change, Esc cancels. The owner then confirms the exact sealed proposal with one
 * tap ("Save S$2.20"), the same rule as every other change.
 */
export function PriceField({ product }: { product: Product }) {
  const t = useCopy()
  const copy = useShopCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const locale = useLocale()
  const name = productName(product.name, locale)
  const [state, setState] = useState<PriceState>({ mode: 'view' })
  const shop = ws.active
  const currency = shopCurrency(shop)
  const numberLocale = moneyLocale(currency, locale) ?? locale
  const shown = formatShopPrice(product.price, currency)

  async function prepare(text: string) {
    // The same reader as every typed amount: "1,000" and "170/-" are what they say; "1,5" in
    // a rupee shop is asked about, never saved as ₹1.50 or ₹15 (PR #701).
    const reading = readNumber(text, numberLocale, currency, 'money')
    if (!reading.ok) {
      const money = (value: number) => formatShopPrice(toMinor(value, currency), currency, locale)
      const error =
        reading.reason === 'ambiguous'
          ? numberQuestion(locale)
              .replace('{a}', money(reading.options[0]))
              .replace('{b}', money(reading.options[1]))
          : copy.priceInvalid
      setState({ mode: 'edit', text, error })
      return
    }
    const price = toMinor(reading.value, currency)
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
          onChange={(event) => setState({ mode: 'edit', text: event.target.value, error: '' })}
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
            'aria-label': copy.editPrice(name),
            'aria-invalid': Boolean(state.error),
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
            {state.error}
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
        setState({
          mode: 'edit',
          text: numberForEditing(toMajor(product.price, currency), numberLocale, 'money', currency),
          error: '',
        })
      }
      // The name says what the button does; the visible price stays part of it.
      aria-label={`${copy.editPrice(name)}, ${shown}`}
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
