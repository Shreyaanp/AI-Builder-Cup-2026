import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Switch,
  Typography,
  useTheme,
} from '@mui/material'
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  Globe,
  Images,
  MessageSquare,
  Pencil,
  Plus,
  Share2,
  Store,
  Trash2,
  UtensilsCrossed,
  ZapOff,
} from 'lucide-react'
import { formatPrice, shopCurrency } from './format'
import { FactList } from './FactList'
import { PendingCard } from './PendingCard'
import { MenuSheet } from '../shop/MenuSheet'
import { FreshnessCard } from '../sales/ShopInsights'
import { ConnectTile } from '../connect/ConnectTile'
import { Sheet } from './Sheet'
import { ShopQr } from './ShopQr'
import { OwnerPerks } from '../passport/games/OwnerPerks'
import { useUnread } from './useUnread'
import { openNow, readiness } from './shopProgress'
import { useCopy } from './strings'
import { isServiceShop, useTabsCopy } from './tabsCopy'
import { spanFor, tileGrid } from './tileSpan'
import { ShopLocation } from './CurrentLocation'
import { useWorkspace } from './workspaceContext'
import { Messages } from '../inquiries/Messages'
import { PlanTomorrow } from '../planning/PlanTomorrow'
import { useCopy as usePlanCopy } from '../planning/strings'
import { enterRise, shape } from '../../design/theme'
import { useRewardCopy } from '../rewards/strings'
import { HoursList } from '../shop/Hours'
import { hasHours } from '../shop/hoursModel'
import { CategoryGroups } from '../shop/CategoryGroups'

import { MapsHandoff } from './MapsHandoff'
import { shopZone } from '../../region/region'
import { ShopIcon } from '../google/ShopIcon'
import { GalleryEditor } from '../google/GalleryEditor'
import { useGallery } from '../google/useGallery'
import { useLocale } from '../../state/hooks'
import { productName } from '../../i18n/productNames'
import { MapCard } from './MapCard'
import type { Proposal } from './api'

export type ShopSheetKind =
  'details' | 'menu' | 'soldOut' | 'customer' | 'messages' | 'plan' | 'readiness' | 'photos'

/** A glanceable tile: icon + label, one big value, a little supporting detail. */
export function Tile({
  icon,
  label,
  value,
  children,
  wide = false,
  span,
  onClick,
  compact = false,
  tour,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  children?: ReactNode
  /** Two columns wide (same as span={2}). */
  wide?: boolean
  /** Columns this tile takes in the content-sized grid (pick 1 or 2 with spanFor()). */
  span?: 1 | 2 | 'full'
  onClick: () => void
  compact?: boolean
  /** Guided-tour anchor (data-tour). */
  tour?: string
}) {
  const roles = useTheme().material
  const columns = span ?? (wide ? 2 : 1)
  return (
    <ButtonBase
      onClick={onClick}
      data-tour={tour}
      sx={{
        gridColumn: columns === 'full' ? '1 / -1' : columns === 2 ? 'span 2' : undefined,
        // A grid too narrow for two columns gives a two-column tile the whole row instead.
        '@container tiles (max-width: 347px)': { gridColumn: '1 / -1' },
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: compact ? 'center' : 'stretch',
        justifyContent: 'flex-start',
        textAlign: 'start',
        gap: 2,
        p: compact ? 2 : 4,
        minHeight: compact ? 48 : 120,
        minWidth: 0,
        borderRadius: `${shape.lgIncreased}px`,
        bgcolor: roles.surfaceContainer,
        color: roles.onSurface,
        ...enterRise,
      }}
    >
      <Stack component="span" direction="row" sx={{ alignItems: 'center', gap: 2 }}>
        <Box component="span" aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
          {icon}
        </Box>
        <Typography
          component="span"
          variant="labelLarge"
          sx={{ flex: 1, color: roles.onSurfaceVariant }}
        >
          {label}
        </Typography>
        <ChevronRight size={18} aria-hidden="true" color={roles.onSurfaceVariant} />
      </Stack>
      <Typography
        component="span"
        variant={compact ? 'labelLarge' : 'titleLarge'}
        sx={{ display: 'block', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
      {children}
    </ButtonBase>
  )
}

export function Supporting({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="span"
      variant="bodyMedium"
      color="text.secondary"
      sx={{ display: 'block', overflowWrap: 'anywhere' }}
    >
      {children}
    </Typography>
  )
}

/**
 * Shop: the customer page leads ("this is your page"), then what is on it (menu or services,
 * hours and address, photos, what customers ask). Also the desktop pane beside the coach.
 */
export function ShopOverview({ narrow = false }: { narrow?: boolean }) {
  // The pane beside the coach skips the pending card: the coach shows it there.
  const t = useCopy()
  const ws = useWorkspace()
  const [sheet, setSheet] = useState<ShopSheetKind | null>(null)
  const { unread, refresh } = useUnread()
  return (
    <Stack spacing={4}>
      <YourPage onSheet={setSheet} />
      {!narrow && (
        <PendingCard
          compact
          unread={unread}
          onMessages={() => setSheet('messages')}
          onAnswer={(fact) => ws.startCoachDraft(`${t.factNames[fact]}: `)}
        />
      )}
      <ShopTiles unread={unread} onSheet={setSheet} />
      {!narrow && <FreshnessCard compact />}
      <ShopSheets
        kind={sheet}
        onClose={() => {
          // Marking messages done changes the tile's count.
          if (sheet === 'messages') refresh()
          setSheet(null)
        }}
      />
    </Stack>
  )
}

/** The customer-facing page, first: what customers see, and one primary "Share page". */
function YourPage({ onSheet }: { onSheet: (kind: ShopSheetKind) => void }) {
  const t = useCopy()
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop) return null
  const url = ws.shareUrl
  const live = shop.public && Boolean(url)
  const summary = [shop.fields.category, shop.fields.location].filter(Boolean).join(' · ')
  function share() {
    if (!url || !shop) return
    const data = { title: shop.fields.name, text: t.shareMessage(shop.fields.name), url }
    if (navigator.share) void navigator.share(data).catch(() => undefined)
    else
      void navigator.clipboard
        .writeText(url)
        .then(() => ws.notify(t.linkCopied))
        .catch(() => ws.notify(t.actionFailed))
  }
  return (
    <Box
      component="section"
      aria-labelledby="your-page-title"
      data-tour="customer"
      sx={{
        p: 4,
        borderRadius: `${shape.lgIncreased}px`,
        bgcolor: roles.primaryContainer,
        color: roles.onPrimaryContainer,
        ...enterRise,
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
        <Box component="span" aria-hidden="true" sx={{ display: 'flex' }}>
          <Globe size={20} />
        </Box>
        <Typography id="your-page-title" component="h2" variant="labelLarge" sx={{ flex: 1 }}>
          {tabs.yourPage}
        </Typography>
        <Chip
          size="small"
          label={live ? t.shared : t.notShared}
          sx={{ bgcolor: roles.surfaceContainerLowest, color: roles.onSurface }}
        />
      </Stack>
      <Stack direction="row" sx={{ mt: 2, gap: 1, alignItems: 'flex-start' }}>
        <Typography variant="titleLarge" component="p" sx={{ flex: 1, overflowWrap: 'anywhere' }}>
          {shop.fields.name}
        </Typography>
        <Button
          size="small"
          color="inherit"
          startIcon={<Pencil size={16} />}
          aria-label={`${t.editProduct}: ${shop.fields.name}`}
          onClick={() => ws.openEditor({ kind: 'business', fields: shop.fields, step: 'name' })}
          sx={{ flexShrink: 0 }}
        >
          {t.editProduct}
        </Button>
      </Stack>
      {summary && (
        <Typography variant="bodyMedium" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
          {summary}
        </Typography>
      )}
      <Typography variant="bodyMedium" sx={{ mt: 1 }}>
        {live ? tabs.pageLive : tabs.pageOff}
      </Typography>
      <Stack direction="row" sx={{ mt: 3, gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {live ? (
          <Button
            variant="contained"
            disableFocusRipple
            startIcon={<Share2 size={18} />}
            onClick={share}
          >
            {tabs.sharePage}
          </Button>
        ) : (
          <Button variant="contained" disableFocusRipple onClick={() => onSheet('customer')}>
            {tabs.turnOnPage}
          </Button>
        )}
        <Button
          color="inherit"
          disableFocusRipple
          aria-haspopup="dialog"
          onClick={() => onSheet('customer')}
          sx={{ minHeight: 48 }}
        >
          {t.customerPage}
        </Button>
      </Stack>
    </Box>
  )
}

/** Shop: a grid of tiles; each opens a bottom sheet with the full list and actions. */
export function ShopTiles({
  unread,
  onSheet,
}: {
  unread: number | null
  onSheet: (kind: ShopSheetKind) => void
}) {
  const t = useCopy()
  const locale = useLocale()
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop) return null
  const currency = shopCurrency(shop)
  const open = openNow(
    shop.fields.hours,
    new Date(),
    shop.fields.weekly_hours,
    shopZone(shop.fields),
  )
  const soldOutNames = ws.products
    .filter((product) => product.available === false)
    .map((product) => productName(product.name, locale))
  const soldOut = soldOutNames.length
  const hoursValue =
    open === null ? shop.fields.hours || t.fields.hours : open ? t.openNow : t.closedNow
  const details =
    [open === null ? '' : shop.fields.hours, shop.fields.location].filter(Boolean).join(' · ') ||
    t.notProvided
  const photos = shop.gallery?.length ?? 0
  return (
    // Content-sized grid: as many 168px+ columns as fit (2 on a phone, 3 at 600px, 4 on a
    // desktop), each tile one or two columns wide by how much it shows, packed densely so no
    // row is left with a hole while a smaller tile could fill it.
    <Box data-testid="shop-tiles" sx={tileGrid}>
      <Tile
        // The whole row, its category groups side by side where they fit.
        span={ws.products.length ? 'full' : 1}
        tour="menu"
        icon={<UtensilsCrossed size={20} />}
        label={isServiceShop(shop.fields.category) ? tabs.services : t.menu}
        value={ws.products.length ? t.itemCount(ws.products.length) : t.noItems}
        onClick={() => onSheet('menu')}
      >
        {ws.products.length > 0 && (
          <CategoryGroups products={ws.products} inline columns>
            {(items) => (
              <Stack component="span" spacing={1} sx={{ px: 2, pb: 1 }}>
                {items.slice(0, 3).map((product) => (
                  <Stack
                    component="span"
                    key={product.id ?? product.name}
                    direction="row"
                    sx={{ gap: 2, justifyContent: 'space-between' }}
                  >
                    <Typography component="span" variant="bodyMedium" noWrap sx={{ minWidth: 0 }}>
                      {productName(product.name, locale)}
                      {/* Same item in two sizes (chai per cup and per pot): the unit tells them apart. */}
                      {product.unit &&
                        ws.products.filter((other) => other.name === product.name).length > 1 &&
                        ` / ${product.unit}`}
                    </Typography>
                    <Typography
                      component="span"
                      variant="bodyMedium"
                      sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                    >
                      {product.available === false
                        ? t.soldOut
                        : formatPrice(product.price, currency)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </CategoryGroups>
        )}
        <Typography component="span" variant="labelLarge" sx={{ color: roles.primary }}>
          {ws.products.length ? t.viewAll : t.addProduct}
        </Typography>
      </Tile>
      <Tile
        span={spanFor(t.soldOutCount(soldOut), soldOutNames.join(' · '))}
        icon={<ZapOff size={20} />}
        label={t.soldOutToday}
        value={t.soldOutCount(soldOut)}
        onClick={() => onSheet('soldOut')}
      >
        {soldOut > 0 && <Supporting>{soldOutNames.join(' · ')}</Supporting>}
      </Tile>
      <Tile
        span={spanFor(hoursValue, details)}
        icon={<Store size={20} />}
        label={t.shopDetails}
        value={hoursValue}
        onClick={() => onSheet('details')}
      >
        <Supporting>{details}</Supporting>
      </Tile>
      <Tile
        icon={<Images size={20} />}
        label={tabs.photos}
        value={photos ? tabs.photoCount(photos) : tabs.addPhotos}
        // O-3: the shop's own photos sheet (the Google guide may be switched off, as in the demo).
        onClick={() => onSheet('photos')}
      />
      <Tile
        icon={
          <Badge badgeContent={unread ?? 0} color="primary" aria-hidden="true">
            <MessageSquare size={20} />
          </Badge>
        }
        label={t.messages}
        value={unread === null ? '–' : t.unread(unread)}
        onClick={() => onSheet('messages')}
      />
      <ConnectTile />
    </Box>
  )
}

/** The Photos sheet's body: the gallery loads only while the sheet is open. */
function ShopPhotos() {
  const gallery = useGallery()
  return <GalleryEditor gallery={gallery} />
}

/** Every My shop sheet. Also opened from coach suggestion chips. */
export function ShopSheets({
  kind,
  onClose,
  menuFocus = null,
}: {
  kind: ShopSheetKind | null
  onClose: () => void
  /** The menu opens at this item (a coach link to a change it just saved). */
  menuFocus?: string | null
}) {
  const t = useCopy()
  const locale = useLocale()
  const rewards = useRewardCopy()
  const plan = usePlanCopy()
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  // Keep the last sheet's content while it slides away.
  const [last, setLast] = useState(kind)
  if (kind !== null && kind !== last) setLast(kind)
  const shop = ws.active
  if (!shop) return null
  // Editors are their own dialogs; close the sheet first so modals never stack.
  const then = (run: () => void) => () => {
    onClose()
    run()
  }
  const list = {
    bgcolor: roles.surfaceContainer,
    borderRadius: `${shape.lg}px`,
    overflow: 'hidden',
  }
  const editDetails = (
    <Button
      variant="contained"
      startIcon={<Pencil size={18} />}
      onClick={then(() => ws.openEditor({ kind: 'business', fields: shop.fields }))}
    >
      {t.editDetails}
    </Button>
  )
  const addProduct = (
    <Button
      variant="contained"
      startIcon={<Plus size={18} />}
      onClick={then(() => ws.openEditor({ kind: 'product', product: null }))}
    >
      {t.addProduct}
    </Button>
  )
  const common = { open: kind !== null, onClose }

  switch (kind ?? last) {
    case 'details':
      return (
        <Sheet
          {...common}
          titleId="details-sheet-title"
          title={shop.fields.name}
          actions={editDetails}
        >
          {kind === 'details' && (
            <Box sx={{ mb: 4 }}>
              <ShopIcon />
            </Box>
          )}
          {kind === 'details' && (
            <Box sx={{ mb: 3 }}>
              <ShopLocation onReviewed={onClose} />
            </Box>
          )}
          {kind === 'details' && (
            <Box sx={{ mb: 4 }}>
              <MapsHandoff fields={shop.fields} products={ws.products} />
            </Box>
          )}
          <Box component="dl" sx={{ m: 0, display: 'grid', gap: 4 }}>
            {(['category', 'location', 'hours', 'phone'] as const).map((key) => (
              <Box key={key}>
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
            <Box>
              <Typography component="dt" variant="labelMedium" color="text.secondary">
                {rewards.reward}
              </Typography>
              <Typography
                component="dd"
                variant="bodyLarge"
                sx={{ m: 0, overflowWrap: 'anywhere' }}
              >
                {shop.fields.reward_text || t.notProvided}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ mt: 6 }}>
            <HoursList hours={shop.fields.weekly_hours} />
            <FactList
              fields={shop.fields}
              onAnswer={(fact) => then(() => ws.startCoachDraft(`${t.factNames[fact]}: `))()}
            />
            {(shop.coach_notes ?? []).length > 0 && (
              <Box component="section" aria-labelledby="coach-memory-title" sx={{ mt: 4 }}>
                <Typography
                  id="coach-memory-title"
                  component="h3"
                  variant="titleSmall"
                  color="text.secondary"
                >
                  {t.coachMemory}
                </Typography>
                <List disablePadding>
                  {(shop.coach_notes ?? []).map((note) => (
                    <ListItem
                      key={note.id}
                      disableGutters
                      divider
                      secondaryAction={
                        <IconButton
                          edge="end"
                          aria-label={`${t.forgetNote}: ${note.text}`}
                          onClick={() =>
                            void ws
                              .api(
                                `/businesses/${encodeURIComponent(shop.id)}/notes/${encodeURIComponent(note.id)}`,
                                { method: 'DELETE' },
                              )
                              .then(() => ws.reload())
                              .catch(() => ws.notify(t.actionFailed))
                          }
                        >
                          <Trash2 size={18} />
                        </IconButton>
                      }
                    >
                      <ListItemText primary={note.text} sx={{ pr: 6 }} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        </Sheet>
      )
    case 'menu':
      return <MenuSheet {...common} focus={menuFocus} />
    case 'soldOut':
      return (
        <Sheet {...common} titleId="soldout-sheet-title" title={t.soldOutToday}>
          <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 4 }}>
            {ws.products.length ? t.soldOutHint : t.productsEmpty}
          </Typography>
          {ws.products.length > 0 && (
            <List disablePadding sx={list}>
              {ws.products.map((product, index) => {
                const available = product.available !== false
                return (
                  <ListItem
                    key={product.id ?? product.name}
                    divider={index < ws.products.length - 1}
                    secondaryAction={
                      <Switch
                        edge="end"
                        checked={available}
                        onChange={(_, checked) => void ws.setAvailability(product, checked)}
                        slotProps={{
                          input: {
                            'aria-label': `${t.available}: ${productName(product.name, locale)}`,
                          },
                        }}
                      />
                    }
                    sx={{ minHeight: 56 }}
                  >
                    <ListItemText
                      primary={productName(product.name, locale)}
                      secondary={available ? t.available : t.soldOut}
                      slotProps={{
                        primary: { variant: 'bodyLarge' },
                        secondary: {
                          variant: 'bodyMedium',
                          color: available ? 'text.secondary' : 'error',
                        },
                      }}
                    />
                  </ListItem>
                )
              })}
            </List>
          )}
        </Sheet>
      )
    case 'customer':
      return (
        <Sheet {...common} titleId="customer-sheet-title" title={t.customerPage}>
          <CustomerPage onReview={onClose} />
        </Sheet>
      )
    case 'photos':
      return (
        <Sheet {...common} titleId="photos-sheet-title" title={tabs.photos}>
          {kind === 'photos' && <ShopPhotos />}
        </Sheet>
      )
    case 'messages':
      // Messages brings its own "Messages (n)" heading, which names the sheet.
      return (
        <Sheet {...common} titleId="messages-title">
          <Messages key={`messages-${shop.id}`} businessId={shop.id} />
        </Sheet>
      )
    case 'plan':
      // Planning brings its own "Plan tomorrow" heading; it needs a saved product first.
      return ws.products.some((product) => product.id) ? (
        <Sheet {...common} titleId="plan-title">
          <Box sx={{ pt: 2 }}>
            <PlanTomorrow key={`plan-${shop.id}`} />
          </Box>
        </Sheet>
      ) : (
        <Sheet {...common} titleId="plan-sheet-title" title={plan.title} actions={addProduct}>
          <Typography variant="bodyMedium" color="text.secondary">
            {t.productsEmpty}
          </Typography>
        </Sheet>
      )
    case 'readiness': {
      const f = shop.fields
      const checks = [
        { label: t.checkName, done: Boolean(f.name.trim()) },
        { label: t.checkCategory, done: Boolean(f.category.trim()) },
        { label: t.checkLocation, done: Boolean(f.location.trim()) },
        { label: t.checkHours, done: hasHours(f) },
        { label: t.checkPhone, done: Boolean(f.phone.trim()) },
        { label: t.checkProducts, done: ws.products.length > 0 },
      ]
      const { done, total } = readiness(ws)
      return (
        <Sheet
          {...common}
          titleId="readiness-sheet-title"
          title={t.readiness(done, total)}
          actions={
            <>
              <Button onClick={then(() => ws.go('google'))}>{t.googleTitle}</Button>
              {editDetails}
            </>
          }
        >
          <List dense disablePadding>
            {checks.map((check) => (
              <ListItem key={check.label} disableGutters>
                <ListItemIcon
                  sx={{ minWidth: 40, color: check.done ? roles.primary : roles.outline }}
                  aria-hidden="true"
                >
                  {check.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </ListItemIcon>
                <ListItemText
                  primary={check.label}
                  secondary={check.done ? t.ready : t.missing}
                  slotProps={{
                    primary: { variant: 'bodyLarge' },
                    secondary: { variant: 'bodyMedium' },
                  }}
                />
              </ListItem>
            ))}
          </List>
        </Sheet>
      )
    }
    default:
      return null
  }
}

/** Customer page switch, link and share actions (moved from the old My shop page). */
function CustomerPage({ onReview }: { onReview: () => void }) {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [busy, setBusy] = useState(false)
  const shop = ws.active
  if (!shop) return null
  if (shop.fields.lat == null || shop.fields.lng == null)
    return (
      <MapCard
        initial={null}
        placeName={shop.fields.location}
        done={null}
        onConfirm={async (owner_location) => {
          const proposal = await ws.api<Proposal>('/proposals', {
            method: 'POST',
            body: JSON.stringify({
              kind: 'business',
              business_id: shop.id,
              revision: shop.revision,
              business: shop.fields,
              owner_location,
            }),
          })
          onReview()
          ws.review(proposal)
        }}
      />
    )
  const url = ws.shareUrl
  return (
    <Box>
      {ws.readOnlyMessage && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {ws.readOnlyMessage}
        </Alert>
      )}
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
        <Typography variant="bodySmall" color="text.secondary" sx={{ flex: 1 }}>
          {shop.public ? t.customerPageOn : t.customerPageOff}
        </Typography>
        <Switch
          checked={shop.public}
          // Not disabled while saving: a disabled control drops focus out of the sheet (and Esc).
          disabled={!url}
          onChange={(_, checked) => {
            if (busy) return
            setBusy(true)
            ws.setShared(checked)
              .catch(() => ws.notify(ws.readOnlyMessage ?? t.actionFailed))
              .finally(() => setBusy(false))
          }}
          slotProps={{ input: { 'aria-label': t.pageSwitch } }}
        />
      </Stack>
      {shop.public && url && (
        <>
          <Typography
            variant="bodyMedium"
            sx={{
              mt: 4,
              px: 4,
              py: 3,
              borderRadius: `${shape.sm}px`,
              bgcolor: roles.surfaceContainerHighest,
              overflowWrap: 'anywhere',
              fontFamily: 'monospace',
            }}
          >
            {url}
          </Typography>
          <Stack direction="row" sx={{ mt: 4, gap: 2, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<Share2 size={18} />}
              onClick={() => {
                const data = {
                  title: shop.fields.name,
                  text: t.shareMessage(shop.fields.name),
                  url,
                }
                if (navigator.share) void navigator.share(data).catch(() => undefined)
                else
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => ws.notify(t.linkCopied))
                    .catch(() => ws.notify(t.actionFailed))
              }}
            >
              {t.share}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Copy size={18} />}
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() => ws.notify(t.linkCopied))
                  .catch(() => ws.notify(t.actionFailed))
              }
            >
              {t.copyLink}
            </Button>
            <Button
              startIcon={<ExternalLink size={18} />}
              sx={{ typography: 'labelMedium', minHeight: 48 }}
              href={url}
              target="_blank"
              rel="noopener"
            >
              {t.openPage}
            </Button>
          </Stack>
          <Box sx={{ mt: 6 }}>
            <ShopQr url={url} name={shop.fields.name} />
          </Box>
        </>
      )}
      <Box sx={{ mt: 6 }}>
        <OwnerPerks />
      </Box>
    </Box>
  )
}
