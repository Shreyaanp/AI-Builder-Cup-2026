import { useContext, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  ButtonBase,
  FormControlLabel,
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
import { visuallyHidden } from '@mui/utils'
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  Ellipsis,
  ExternalLink,
  Images,
  MessageSquare,
  Pencil,
  Share2,
  ShoppingBasket,
  Stamp,
  Store,
  Trash2,
  UtensilsCrossed,
  ZapOff,
} from 'lucide-react'
import { FactList } from './FactList'
import { MenuSheet } from '../shop/MenuSheet'
import { ThingsIBuySheet } from '../shop/ThingsIBuySheet'
import { onMenu } from '../shop/stock'
import { useStockCopy } from '../shop/stockCopy'
import { ConnectRow } from '../connect/ConnectTile'
import { Sheet } from './Sheet'
import { AskHint } from './AskHint'
import { ClosedTodaySwitch } from './TwoPaths'
import { ShopQr } from './ShopQr'
import { OwnerPerks } from '../passport/games/OwnerPerks'
import { useUnread } from './useUnread'
import { busyWindow, openNow, readiness } from './shopProgress'
import { useCopy } from './strings'
import { isServiceShop, useTabsCopy } from './tabsCopy'
import { RowGroup, ShopRow } from './ShopRow'
import { ShopLocation } from './CurrentLocation'
import { useWorkspace } from './workspaceContext'
import { Messages } from '../inquiries/Messages'
import { enterRise, shape } from '../../design/theme'
import { useRewardCopy } from '../rewards/strings'
import { HoursList } from '../shop/Hours'
import { hasHours } from '../shop/hoursModel'

import { MapsHandoff } from './MapsHandoff'
import { countryArea, shopRegion, shopZone } from '../../region/region'
import { ShopIcon } from '../google/ShopIcon'
import { GalleryEditor } from '../google/GalleryEditor'
import { useGallery } from '../google/useGallery'
import { useLocale } from '../../state/hooks'
import { productName } from '../../i18n/productNames'
import { MapCard } from './MapCard'
import { ListTile } from './GrowList'
import { TileLayoutContext } from './growLayout'
import type { Proposal } from './api'

/** How many menu items the busy-hours question goes through (menu order). */
const SWEEP_ITEMS = 3

export type ShopSheetKind =
  | 'details'
  | 'menu'
  | 'soldOut'
  | 'customer'
  | 'messages'
  | 'readiness'
  | 'photos'
  | 'stamps'
  /** The stamp card with its thank-you perks already open (the coach's "show my perks"). */
  | 'perks'
  /** Tea dust, milk and the rest the shop buys to make its menu (OB-310). */
  | 'thingsIBuy'

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
  alert = false,
  badge,
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
  /** Something to act on now, not a tool: in a Grow group it is not one of the row's names. */
  alert?: boolean
  /** A short live state on the More tools icon (Grow only). */
  badge?: string
}) {
  const roles = useTheme().material
  const columns = span ?? (wide ? 2 : 1)
  // Grow draws the same tools as rows and a More tools grid (simplify batch 4a).
  const layout = useContext(TileLayoutContext)
  if (layout !== 'card')
    return (
      <ListTile
        layout={layout}
        icon={icon}
        label={label}
        value={value}
        onClick={onClick}
        tour={tour}
        alert={alert}
        badge={badge}
      >
        {children}
      </ListTile>
    )
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
 * Shop: one card for the customer page (name, whether customers see it), one row per part of
 * the shop with a single status, then the one primary action in the thumb zone. The quieter
 * tools (stamp card, billing app) sit behind More on the same screen. Also the desktop pane
 * beside the coach. What needs the owner (waiting customers, the daily menu question) lives on
 * Coach Today, not here.
 */
export function ShopOverview({ narrow = false }: { narrow?: boolean }) {
  const [sheet, setSheet] = useState<ShopSheetKind | null>(null)
  const { unread, refresh } = useUnread()
  return (
    <Stack spacing={3}>
      <YourPage onSheet={setSheet} />
      <ShopTiles unread={unread} onSheet={setSheet} />
      <PageAction onSheet={setSheet} />
      {!narrow && <AskHint id="sold_out" />}
      <ShopSheets
        kind={sheet}
        onClose={() => {
          // Marking messages done changes the row's count.
          if (sheet === 'messages') refresh()
          setSheet(null)
        }}
      />
    </Stack>
  )
}

/** The customer page, first: name, kind and one status line; a tap opens the page sheet. */
function YourPage({ onSheet }: { onSheet: (kind: ShopSheetKind) => void }) {
  const t = useCopy()
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop) return null
  const live = shop.public && Boolean(ws.shareUrl)
  // The kind of shop only: the full address lives in Shop details.
  const summary = shop.fields.category
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
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
        {/* The card opens the page sheet: the switch, link, QR code and sharing. */}
        <ButtonBase
          aria-haspopup="dialog"
          onClick={() => onSheet('customer')}
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            display: 'block',
            textAlign: 'start',
            borderRadius: `${shape.sm}px`,
            '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
          }}
        >
          <Typography id="your-page-title" component="span" sx={visuallyHidden}>
            {tabs.yourPage}
          </Typography>
          <Typography
            component="span"
            variant="titleLarge"
            sx={{ display: 'block', overflowWrap: 'anywhere' }}
          >
            {shop.fields.name}
          </Typography>
          {summary && (
            <Typography
              component="span"
              variant="bodyMedium"
              sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}
            >
              {summary}
            </Typography>
          )}
          <Stack component="span" direction="row" sx={{ mt: 1, gap: 2, alignItems: 'center' }}>
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: '50%',
                bgcolor: live ? roles.primary : roles.outline,
              }}
            />
            <Typography component="span" variant="bodyMedium">
              {live ? tabs.pageLive : tabs.pageOff}
            </Typography>
          </Stack>
        </ButtonBase>
        <IconButton
          color="inherit"
          aria-label={`${t.editProduct}: ${shop.fields.name}`}
          onClick={() => ws.openEditor({ kind: 'business', fields: shop.fields, step: 'name' })}
          sx={{ width: 48, height: 48, flexShrink: 0 }}
        >
          <Pencil size={20} />
        </IconButton>
      </Stack>
    </Box>
  )
}

/** The page's one primary action, in the thumb zone below the rows: show it, then share it. */
function PageAction({ onSheet }: { onSheet: (kind: ShopSheetKind) => void }) {
  const t = useCopy()
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  const shop = ws.active
  if (!shop) return null
  const url = ws.shareUrl
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
  return shop.public && url ? (
    <Button
      fullWidth
      variant="contained"
      disableFocusRipple
      startIcon={<Share2 size={18} />}
      onClick={share}
      sx={{ minHeight: 48 }}
    >
      {tabs.sharePage}
    </Button>
  ) : (
    <Button
      fullWidth
      variant="contained"
      disableFocusRipple
      aria-haspopup="dialog"
      onClick={() => onSheet('customer')}
      sx={{ minHeight: 48 }}
    >
      {tabs.turnOnPage}
    </Button>
  )
}

/** Shop: one row per part of the shop; each opens a bottom sheet with the full list and actions. */
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
  const stock = useStockCopy()
  const ws = useWorkspace()
  const [more, setMore] = useState(false)
  const shop = ws.active
  if (!shop) return null
  const open = openNow(
    shop.fields.hours,
    new Date(),
    shop.fields.weekly_hours,
    shopZone(shop.fields),
  )
  // In the busy hours the row asks about the top items, one at a time (the old sweep card).
  // Customers buy from the menu; the things the shop buys have their own row (OB-310).
  const menu = ws.products.filter(onMenu)
  const bought = ws.products.length - menu.length
  const sweep = busyWindow(shop.fields.busy_hours)
    ? menu.slice(0, SWEEP_ITEMS).find((product) => product.available !== false)
    : undefined
  const soldOutNames = menu
    .filter((product) => product.available === false)
    .map((product) => productName(product.name, locale))
  const hours =
    [open === null ? '' : open ? t.openNow : t.closedNow, shop.fields.hours]
      .filter(Boolean)
      .join(' · ') || t.notProvided
  const photos = shop.gallery?.length ?? 0
  return (
    <Stack spacing={2} data-testid="shop-tiles">
      <RowGroup>
        <ShopRow
          tour="menu"
          icon={<UtensilsCrossed size={20} />}
          label={isServiceShop(shop.fields.category) ? tabs.services : t.menu}
          value={menu.length ? t.itemCount(menu.length) : t.noItems}
          onClick={() => onSheet('menu')}
        />
        <ShopRow
          icon={<ZapOff size={20} />}
          label={t.soldOut}
          value={
            sweep
              ? t.sweepQuestion(productName(sweep.name, locale))
              : soldOutNames.length
                ? soldOutNames.join(' · ')
                : t.soldOutCount(0)
          }
          onClick={() => onSheet('soldOut')}
        />
        <ShopRow
          icon={
            <Badge badgeContent={unread ?? 0} color="primary" aria-hidden="true">
              <MessageSquare size={20} />
            </Badge>
          }
          label={t.messages}
          value={unread === null ? '–' : t.unread(unread)}
          onClick={() => onSheet('messages')}
        />
        <ShopRow
          icon={<Images size={20} />}
          label={tabs.photos}
          value={photos ? tabs.photoCount(photos) : tabs.addPhotos}
          // O-3: the shop's own photos sheet (the Google guide may be switched off, as in the demo).
          onClick={() => onSheet('photos')}
        />
        <ShopRow
          icon={<Store size={20} />}
          label={t.shopDetails}
          value={hours}
          onClick={() => onSheet('details')}
        />
        <ShopRow
          icon={<Ellipsis size={20} />}
          label={tabs.more}
          value={more ? undefined : `${tabs.stampCard} · ${tabs.billingApp}`}
          expanded={more}
          controls="shop-more"
          onClick={() => setMore((value) => !value)}
        />
      </RowGroup>
      {more && (
        <Box id="shop-more">
          <RowGroup>
            {bought > 0 && (
              <ShopRow
                icon={<ShoppingBasket size={20} />}
                label={stock.thingsIBuy}
                value={stock.thingsIBuyCount(bought)}
                onClick={() => onSheet('thingsIBuy')}
              />
            )}
            <ShopRow
              icon={<Stamp size={20} />}
              label={tabs.stampCard}
              value={shop.fields.reward_text || tabs.perksOff}
              onClick={() => onSheet('stamps')}
            />
            <ConnectRow />
          </RowGroup>
        </Box>
      )}
    </Stack>
  )
}

/** The Photos sheet's body: the gallery loads only while the sheet is open. */
function ShopPhotos() {
  const gallery = useGallery()
  return <GalleryEditor gallery={gallery} />
}

/** Every My shop sheet. Also opened from coach suggestion chips. */
export function ShopSheets(props: {
  kind: ShopSheetKind | null
  onClose: () => void
  /** The menu opens at this item (a coach link to a change it just saved). */
  menuFocus?: string | null
}) {
  // The Menu's "Things I buy" link: the menu closes first so sheets never stack (OB-310).
  const [things, setThings] = useState(false)
  return (
    <>
      <OneSheet
        {...props}
        onThingsIBuy={() => {
          props.onClose()
          setThings(true)
        }}
      />
      <ThingsIBuySheet open={things} onClose={() => setThings(false)} />
    </>
  )
}

function OneSheet({
  kind,
  onClose,
  menuFocus = null,
  onThingsIBuy,
}: {
  kind: ShopSheetKind | null
  onClose: () => void
  menuFocus?: string | null
  onThingsIBuy: () => void
}) {
  const t = useCopy()
  const locale = useLocale()
  const rewards = useRewardCopy()
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  // Keep the last sheet's content while it slides away.
  const [last, setLast] = useState(kind)
  if (kind !== null && kind !== last) setLast(kind)
  const shop = ws.active
  if (!shop) return null
  // Only what customers can buy is ever sold out or listed for them (OB-310).
  const menu = ws.products.filter(onMenu)
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
  const common = { open: kind !== null, onClose }

  switch (kind ?? last) {
    case 'details':
      return (
        <Sheet
          {...common}
          titleId="details-sheet-title"
          ask="closed_today"
          title={shop.fields.name}
          actions={editDetails}
        >
          {kind === 'details' && (
            <Box sx={{ mb: 4 }}>
              <ClosedTodaySwitch onReview={onClose} />
            </Box>
          )}
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
              <MapsHandoff fields={shop.fields} products={menu} />
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
      return <MenuSheet {...common} focus={menuFocus} onThingsIBuy={onThingsIBuy} />
    case 'thingsIBuy':
      return <ThingsIBuySheet {...common} />
    case 'soldOut':
      return (
        <Sheet {...common} titleId="soldout-sheet-title" ask="sold_out" title={t.soldOut}>
          <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 4 }}>
            {/* "Customers see it straight away" only while they can (Priya, 8 Nov). */}
            {!menu.length
              ? t.productsEmpty
              : shop.public && ws.shareUrl
                ? t.soldOutHint
                : t.soldOutHintHidden}
          </Typography>
          {menu.length > 0 && (
            <List disablePadding sx={list}>
              {menu.map((product, index) => {
                const available = product.available !== false
                return (
                  <ListItem
                    key={product.id ?? product.name}
                    divider={index < menu.length - 1}
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
        <Sheet {...common} titleId="customer-sheet-title" ask="share" title={tabs.yourPage}>
          <CustomerPage />
        </Sheet>
      )
    case 'stamps':
    case 'perks':
      return (
        <Sheet
          {...common}
          titleId="stamps-sheet-title"
          ask="stamps"
          title={tabs.stampCard}
          actions={
            <Button
              variant="contained"
              startIcon={<Pencil size={18} />}
              onClick={then(() =>
                ws.openEditor({ kind: 'business', fields: shop.fields, step: 'reward' }),
              )}
            >
              {tabs.changeStampCard}
            </Button>
          }
        >
          {(kind === 'stamps' || kind === 'perks') && <StampCard perksOpen={kind === 'perks'} />}
        </Sheet>
      )
    case 'photos':
      return (
        <Sheet {...common} titleId="photos-sheet-title" ask="photos" title={tabs.photos}>
          {kind === 'photos' && <ShopPhotos />}
        </Sheet>
      )
    case 'messages':
      // Messages brings its own "Messages (n)" heading, which names the sheet.
      return (
        <Sheet {...common} titleId="messages-title" ask="messages">
          {/* The owner's language lives in You → Language, not beside the conversation. */}
          <Messages key={`messages-${shop.id}`} businessId={shop.id} />
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
          ask="google"
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

/**
 * Customer page: ONE labelled switch shows the shop to customers (Priya, 8 Nov: the place was
 * saved and the shop stayed hidden behind a second, unlabelled switch). Without a place yet, the
 * owner says where (typed area, phone location or area only) and confirming it shows the shop.
 */
function CustomerPage() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [busy, setBusy] = useState(false)
  const shop = ws.active
  if (!shop) return null
  const placed = shop.fields.lat != null && shop.fields.lng != null
  const url = ws.shareUrl
  const region = shopRegion(shop.fields)
  const near = region.country ? countryArea(region.country) : null
  const liveSwitch = (
    <FormControlLabel
      labelPlacement="start"
      control={
        <Switch
          checked={shop.public}
          // Not disabled while saving: a disabled control drops focus out of the sheet (and Esc).
          disabled={placed && !url}
          onChange={(_, checked) => {
            if (busy) return
            if (!placed) {
              // The place comes first: the area box below takes the owner's answer.
              document.querySelector<HTMLInputElement>('[data-testid="map-area"]')?.focus()
              return
            }
            setBusy(true)
            ws.setShared(checked)
              .catch(() => ws.notify(ws.readOnlyMessage ?? t.actionFailed))
              .finally(() => setBusy(false))
          }}
        />
      }
      label={
        <Typography variant="titleMedium" component="span">
          {t.liveSwitch}
        </Typography>
      }
      sx={{ mx: 0, gap: 2, width: '100%', justifyContent: 'space-between', minHeight: 48 }}
    />
  )
  if (!placed)
    return (
      <Box>
        {liveSwitch}
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          {t.liveNeedsPlace}
        </Typography>
        <MapCard
          initial={null}
          placeName={shop.fields.location}
          done={null}
          near={near ? { lat: near.lat, lng: near.lng } : null}
          areaOption
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
            // The owner just confirmed the place on the map: it is saved and the shop shown
            // in one go, with no second review of the same pin.
            await ws.api(`/proposals/${proposal.id}/approve`, {
              method: 'POST',
              body: JSON.stringify({ digest: proposal.digest }),
            })
            await ws.setShared(true).catch(() => ws.notify(ws.readOnlyMessage ?? t.actionFailed))
          }}
        />
      </Box>
    )
  return (
    <Box>
      {ws.readOnlyMessage && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {ws.readOnlyMessage}
        </Alert>
      )}
      {liveSwitch}
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
        {shop.public ? t.customerPageOn : t.customerPageOff}
      </Typography>
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
    </Box>
  )
}

/** The stamp card (what a full card earns), then the smaller thank-you perks on request. */
function StampCard({ perksOpen = false }: { perksOpen?: boolean }) {
  const t = useCopy()
  const tabs = useTabsCopy()
  const rewards = useRewardCopy()
  const ws = useWorkspace()
  const [perks, setPerks] = useState(perksOpen)
  const shop = ws.active
  if (!shop) return null
  const stamps = shop.fields.stamps_needed ?? 8
  return (
    <Box>
      <Typography variant="labelLarge" color="text.secondary" sx={{ display: 'block' }}>
        {rewards.reward}
      </Typography>
      <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
        {shop.fields.reward_text || t.notProvided}
      </Typography>
      {shop.fields.reward_text && (
        <Typography variant="bodyMedium" color="text.secondary">
          {tabs.perksAfter(stamps)}
        </Typography>
      )}
      <Button
        aria-expanded={perks}
        aria-controls="stamp-more-rewards"
        onClick={() => setPerks((value) => !value)}
        sx={{ mt: 4, minHeight: 48, px: 0 }}
      >
        {tabs.moreRewards}
      </Button>
      {perks && (
        <Box id="stamp-more-rewards" sx={{ mt: 2 }}>
          <OwnerPerks />
        </Box>
      )}
    </Box>
  )
}
