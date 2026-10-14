import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import {
  ArrowRight,
  Camera,
  ChevronRight,
  Clock,
  MapPin,
  Package,
  Pencil,
  Plus,
  Store,
  Tag,
} from 'lucide-react'
import { formatPrice, shopCurrency } from './format'
import { LoadError } from './LoadError'
import { Sheet } from './Sheet'
import { nextStep, readiness } from './shopProgress'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { enterRise, fieldFade, shape } from '../../design/theme'

/** Before any shop exists: one start card, nothing else. */
export function StartCard() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  if (ws.loading) return null
  if (ws.loadError) return <LoadError />
  return (
    <Box
      component="section"
      aria-labelledby="start-title"
      data-step="scan"
      sx={{
        bgcolor: roles.secondaryContainer,
        color: roles.onSecondaryContainer,
        borderRadius: `${shape.xl}px`,
        p: 6,
        ...enterRise,
      }}
    >
      <Typography id="start-title" component="h2" variant="titleLarge">
        {t.nextScan}
      </Typography>
      <Typography variant="bodyMedium" sx={{ mt: 1 }}>
        {t.coachHint}
      </Typography>
      <Stack direction="row" sx={{ mt: 5, gap: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<Camera size={20} />} onClick={ws.requestPhoto}>
          {t.nextScanAction}
        </Button>
        <Button
          startIcon={<Store size={20} />}
          onClick={() => ws.openEditor({ kind: 'business', fields: null })}
          sx={{ color: roles.onSecondaryContainer }}
        >
          {t.suggestAdd}
        </Button>
      </Stack>
    </Box>
  )
}

/** Fades a value in whenever it changes after first render (not on mount). */
function Live({ value, children }: { value: string; children: ReactNode }) {
  const [seen, setSeen] = useState(value)
  const [changes, setChanges] = useState(0)
  if (seen !== value) {
    setSeen(value)
    setChanges(changes + 1)
  }
  return (
    <Box component="span" key={changes} sx={{ display: 'block', ...(changes ? fieldFade : {}) }}>
      {children}
    </Box>
  )
}

/** One field on the card: the value once known, otherwise the muted field name. */
function Field({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  const roles = useTheme().material
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 2, minWidth: 0 }}>
      <Box
        aria-hidden="true"
        sx={{ display: 'flex', flexShrink: 0, color: value ? roles.primary : roles.outline }}
      >
        {icon}
      </Box>
      <Typography
        component="span"
        variant="bodyMedium"
        noWrap
        sx={{ minWidth: 0, color: value ? roles.onSurface : roles.onSurfaceVariant }}
      >
        <Live value={value}>{value || label}</Live>
      </Typography>
    </Stack>
  )
}

/**
 * The shop as it is being built. Fills in as proposals are confirmed; tap to open the details
 * sheet. `dense` is the one-line version that stays on screen during a conversation.
 */
export function ShopCard({
  dense = false,
  onOpen,
}: {
  dense?: boolean
  onOpen: (productIndex?: number) => void
}) {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop) return null
  const { done, total } = readiness(ws)
  const ready = t.readiness(done, total)
  const label = `${t.shopDetails}: ${shop.fields.name}`
  // Dense card: only what is already known, else how far along the shop is.
  const summary =
    [
      shop.fields.category,
      shop.fields.hours,
      ws.products.length ? t.itemCount(ws.products.length) : '',
    ]
      .filter(Boolean)
      .join(' · ') || ready

  if (dense)
    return (
      <ButtonBase
        aria-label={label}
        onClick={() => onOpen()}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          gap: 3,
          px: 3,
          py: 2,
          minHeight: 56,
          textAlign: 'start',
          borderRadius: `${shape.lg}px`,
          bgcolor: roles.surfaceContainer,
          ...enterRise,
        }}
      >
        <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <CircularProgress
            variant="determinate"
            value={100}
            size={36}
            thickness={4}
            aria-hidden="true"
            sx={{ color: roles.surfaceContainerHighest, position: 'absolute' }}
          />
          <CircularProgress
            variant="determinate"
            value={(done / total) * 100}
            size={36}
            thickness={4}
            aria-label={ready}
            sx={{ color: roles.primary }}
          />
          <Typography
            variant="labelSmall"
            aria-hidden="true"
            sx={{ position: 'absolute', fontVariantNumeric: 'tabular-nums' }}
          >
            {done}/{total}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="titleSmall" noWrap component="span" sx={{ display: 'block' }}>
            <Live value={shop.fields.name}>{shop.fields.name}</Live>
          </Typography>
          <Typography
            variant="bodySmall"
            noWrap
            component="span"
            sx={{ display: 'block', color: roles.onSurfaceVariant }}
          >
            <Live value={summary}>{summary}</Live>
          </Typography>
        </Box>
        <ChevronRight size={20} aria-hidden="true" color={roles.onSurfaceVariant} />
      </ButtonBase>
    )

  const step = nextStep(ws, t)
  const shown = ws.products.slice(0, 4)
  const more = ws.products.length - shown.length
  return (
    <Box
      component="section"
      aria-label={shop.fields.name}
      sx={{ bgcolor: roles.surfaceContainer, borderRadius: `${shape.xl}px`, ...enterRise }}
    >
      <ButtonBase
        aria-label={label}
        onClick={() => onOpen()}
        sx={{
          display: 'block',
          width: '100%',
          textAlign: 'start',
          p: 5,
          pb: 3,
          borderRadius: `${shape.xl}px ${shape.xl}px 0 0`,
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 3 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 48,
              height: 48,
              flexShrink: 0,
              borderRadius: `${shape.md}px`,
              display: 'grid',
              placeItems: 'center',
              bgcolor: roles.primaryContainer,
              color: roles.onPrimaryContainer,
            }}
          >
            <Store size={24} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="titleLarge" noWrap component="span" sx={{ display: 'block' }}>
              <Live value={shop.fields.name}>{shop.fields.name}</Live>
            </Typography>
            <Typography
              variant="labelMedium"
              component="span"
              sx={{
                display: 'block',
                color: roles.onSurfaceVariant,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <Live value={ready}>{ready}</Live>
            </Typography>
          </Box>
          <ChevronRight size={22} aria-hidden="true" color={roles.onSurfaceVariant} />
        </Stack>
        <LinearProgress
          variant="determinate"
          value={(done / total) * 100}
          aria-label={ready}
          sx={{
            mt: 4,
            height: 4,
            borderRadius: 2,
            bgcolor: roles.surfaceContainerHighest,
          }}
        />
        <Box
          sx={{
            mt: 4,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            columnGap: 4,
            rowGap: 2,
          }}
        >
          <Field icon={<Tag size={18} />} label={t.fields.category} value={shop.fields.category} />
          <Field icon={<Clock size={18} />} label={t.fields.hours} value={shop.fields.hours} />
          <Field
            icon={<MapPin size={18} />}
            label={t.fields.location}
            value={shop.fields.location}
          />
          <Field
            icon={<Package size={18} />}
            label={t.products}
            value={ws.products.length ? t.itemCount(ws.products.length) : ''}
          />
        </Box>
      </ButtonBase>
      {shown.length > 0 && (
        <Stack direction="row" sx={{ px: 5, pb: 2, gap: 2, flexWrap: 'wrap' }}>
          {shown.map((product, index) => (
            <Chip
              key={product.id ?? product.name}
              label={product.name}
              onClick={() => onOpen(index)}
              variant="outlined"
              sx={{ height: 32, maxWidth: '100%', borderColor: roles.outlineVariant, ...enterRise }}
            />
          ))}
          {more > 0 && (
            <Chip
              label={`+${more}`}
              aria-label={t.itemCount(ws.products.length)}
              onClick={() => onOpen(shown.length)}
              variant="outlined"
              sx={{ height: 32, borderColor: roles.outlineVariant }}
            />
          )}
        </Stack>
      )}
      <Box sx={{ px: 3, pb: 3, pt: shown.length ? 0 : 1 }} data-step={step.id}>
        <Button
          startIcon={step.icon}
          endIcon={<ArrowRight size={18} />}
          onClick={step.run}
          sx={{ px: 2, justifyContent: 'flex-start', maxWidth: '100%' }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {step.title}
          </Box>
        </Button>
      </Box>
    </Box>
  )
}

/** Details and edit actions for the active shop, as a bottom sheet. */
export function ShopSheet({
  open,
  focusProduct,
  onClose,
}: {
  open: boolean
  focusProduct: number | null
  onClose: () => void
}) {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop) return null
  const currency = shopCurrency(shop)
  const { done, total } = readiness(ws)
  // Editors are their own dialogs; close the sheet first so modals never stack.
  const edit = (run: () => void) => {
    onClose()
    run()
  }
  const keys = ['category', 'location', 'hours', 'phone'] as const
  return (
    <Sheet
      open={open}
      onClose={onClose}
      titleId="shop-sheet-title"
      title={shop.fields.name}
      onEntered={() => {
        if (focusProduct !== null)
          document.getElementById(`shop-sheet-product-${focusProduct}`)?.focus()
      }}
      actions={
        <>
          <Button onClick={() => edit(() => ws.go('shop'))}>{t.navShop}</Button>
          <Button
            variant="contained"
            startIcon={<Pencil size={18} />}
            onClick={() => edit(() => ws.openEditor({ kind: 'business', fields: shop.fields }))}
          >
            {t.editDetails}
          </Button>
        </>
      }
    >
      <Stack spacing={6}>
        <Box>
          <Typography variant="labelLarge" color="text.secondary">
            {t.readiness(done, total)}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={(done / total) * 100}
            aria-label={t.readiness(done, total)}
            sx={{ mt: 2, height: 4, borderRadius: 2, bgcolor: roles.surfaceContainerHighest }}
          />
        </Box>
        <Box
          component="dl"
          sx={{
            m: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 4,
          }}
        >
          {keys.map((key) => (
            <Box key={key} sx={{ minWidth: 0 }}>
              <Typography component="dt" variant="labelMedium" color="text.secondary">
                {t.fields[key]}
              </Typography>
              <Typography
                component="dd"
                variant="bodyLarge"
                sx={{
                  m: 0,
                  overflowWrap: 'anywhere',
                  color: shop.fields[key] ? 'text.primary' : 'text.secondary',
                }}
              >
                {shop.fields[key] || t.notProvided}
              </Typography>
            </Box>
          ))}
        </Box>
        <Box>
          <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
            <Typography component="h3" variant="titleSmall" color="text.secondary" sx={{ flex: 1 }}>
              {t.products}
            </Typography>
            <Button
              startIcon={<Plus size={18} />}
              onClick={() => edit(() => ws.openEditor({ kind: 'product', product: null }))}
            >
              {t.addProduct}
            </Button>
          </Stack>
          {ws.products.length === 0 ? (
            <Typography variant="bodyMedium" color="text.secondary">
              {t.productsEmpty}
            </Typography>
          ) : (
            <List
              disablePadding
              sx={{
                bgcolor: roles.surfaceContainer,
                borderRadius: `${shape.lg}px`,
                overflow: 'hidden',
              }}
            >
              {ws.products.map((product, index) => {
                const available = product.available !== false
                return (
                  <ListItemButton
                    key={product.id ?? product.name}
                    id={`shop-sheet-product-${index}`}
                    divider={index < ws.products.length - 1}
                    aria-label={`${t.editProduct} ${product.name}`}
                    onClick={() => edit(() => ws.openEditor({ kind: 'product', product }))}
                    sx={{ borderRadius: 0 }}
                  >
                    <ListItemText
                      primary={product.name}
                      secondary={
                        (available ? '' : `${t.soldOut} · `) +
                        `${formatPrice(product.price, currency)} / ${product.unit}`
                      }
                      slotProps={{
                        primary: { variant: 'bodyLarge' },
                        secondary: {
                          variant: 'bodyMedium',
                          color: available ? 'text.secondary' : 'error',
                        },
                      }}
                    />
                  </ListItemButton>
                )
              })}
            </List>
          )}
        </Box>
      </Stack>
    </Sheet>
  )
}
