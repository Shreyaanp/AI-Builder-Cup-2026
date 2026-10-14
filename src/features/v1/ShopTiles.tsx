import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  LinearProgress,
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
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  Gauge,
  Globe,
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
import { FreshnessCard, RecapTile } from '../sales/ShopInsights'
import { PrepPlanTile } from '../forecast/PrepPlan'
import { OrdersTile } from '../sourcing/Orders'
import { Sheet } from './Sheet'
import { ShopQr } from './ShopQr'
import { useUnread } from './useUnread'
import { openNow, readiness } from './shopProgress'
import { useCopy } from './strings'
import { spanFor } from './tileSpan'
import { useWorkspace } from './workspaceContext'
import { Messages } from '../inquiries/Messages'
import { PlanTomorrow } from '../planning/PlanTomorrow'
import { useCopy as usePlanCopy } from '../planning/strings'
import { enterRise, shape } from '../../design/theme'
import { useRewardCopy } from '../rewards/strings'
import { HoursList } from '../shop/Hours'
import { hasHours } from '../shop/hoursModel'
import { CategoryGroups } from '../shop/CategoryGroups'

export type ShopSheetKind =
  'details' | 'menu' | 'soldOut' | 'customer' | 'messages' | 'plan' | 'readiness'

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
}) {
  const roles = useTheme().material
  const columns = span ?? (wide ? 2 : 1)
  return (
    <ButtonBase
      onClick={onClick}
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
 * Tiles + their sheets + the one pending card: My shop, and the desktop pane beside the coach.
 */
export function ShopOverview({ narrow = false }: { narrow?: boolean }) {
  // The pane beside the coach skips the pending card: the coach shows it there.
  const t = useCopy()
  const ws = useWorkspace()
  const [sheet, setSheet] = useState<ShopSheetKind | null>(null)
  const { unread, refresh } = useUnread()
  return (
    <Stack spacing={4}>
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

/** My shop: a grid of tiles; each opens a bottom sheet with the full list and actions. */
export function ShopTiles({
  unread,
  onSheet,
}: {
  unread: number | null
  onSheet: (kind: ShopSheetKind) => void
}) {
  const t = useCopy()
  const plan = usePlanCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop) return null
  const currency = shopCurrency(shop)
  const open = openNow(
    shop.fields.hours,
    new Date(),
    shop.fields.weekly_hours,
    shop.fields.timezone ?? 'Asia/Singapore',
  )
  const soldOutNames = ws.products
    .filter((product) => product.available === false)
    .map((product) => product.name)
  const soldOut = soldOutNames.length
  const { done, total } = readiness(ws)
  const hoursValue =
    open === null ? shop.fields.hours || t.fields.hours : open ? t.openNow : t.closedNow
  const details =
    [open === null ? '' : shop.fields.hours, shop.fields.category, shop.fields.location]
      .filter(Boolean)
      .join(' · ') || t.notProvided
  return (
    // Content-sized grid: as many 168px+ columns as fit (2 on a phone, 3 at 600px, 4 on a
    // desktop), each tile one or two columns wide by how much it shows, packed densely so no
    // row is left with a hole while a smaller tile could fill it.
    <Box
      data-testid="shop-tiles"
      sx={{
        containerType: 'inline-size',
        containerName: 'tiles',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 168px), 1fr))',
        gridAutoFlow: 'row dense',
        gap: 3,
      }}
    >
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
        // The whole row, its category groups side by side where they fit.
        span={ws.products.length ? 'full' : 1}
        icon={<UtensilsCrossed size={20} />}
        label={t.menu}
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
                      {product.name}
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
      <PrepPlanTile key={shop.id} />
      <Tile
        icon={<Globe size={20} />}
        label={t.customerPage}
        value={shop.public ? t.shared : t.notShared}
        onClick={() => onSheet('customer')}
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
      <OrdersTile key={`orders-${shop.id}`} />
      <Tile
        icon={<CalendarClock size={20} />}
        label={plan.title}
        value={t.planHint}
        onClick={() => onSheet('plan')}
      />
      <Tile
        // Its progress bar wants width; done, it is one thin row across the grid.
        span={done < total ? 2 : 'full'}
        icon={<Gauge size={20} />}
        compact={done === total}
        label={t.readinessTitle}
        value={t.readiness(done, total)}
        onClick={() => onSheet('readiness')}
      >
        {shop.registration === 'verification_pending' && (
          <Box component="span">
            <Chip
              component="span"
              size="small"
              label={t.verificationPending}
              sx={{ bgcolor: roles.secondaryContainer, color: roles.onSecondaryContainer }}
            />
          </Box>
        )}
        {done < total && (
          <LinearProgress
            variant="determinate"
            value={(done / total) * 100}
            aria-hidden="true"
            sx={{ height: 4, borderRadius: 2, bgcolor: roles.surfaceContainerHighest }}
          />
        )}
      </Tile>
      <RecapTile />
    </Box>
  )
}

/** Every My shop sheet. Also opened from coach suggestion chips. */
export function ShopSheets({ kind, onClose }: { kind: ShopSheetKind | null; onClose: () => void }) {
  const t = useCopy()
  const rewards = useRewardCopy()
  const plan = usePlanCopy()
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
      return <MenuSheet {...common} />
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
                        slotProps={{ input: { 'aria-label': `${t.available}: ${product.name}` } }}
                      />
                    }
                    sx={{ minHeight: 56 }}
                  >
                    <ListItemText
                      primary={product.name}
                      secondary={available ? t.available : t.soldOut}
                      slotProps={{
                        primary: { variant: 'bodyLarge' },
                        secondary: {
                          variant: 'bodySmall',
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
          <CustomerPage />
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
              <Button onClick={then(() => ws.go('google'))}>{t.navGoogle}</Button>
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
                    secondary: { variant: 'bodySmall' },
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
function CustomerPage() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [busy, setBusy] = useState(false)
  const shop = ws.active
  if (!shop) return null
  const url = ws.shareUrl
  return (
    <Box>
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
              .catch(() => ws.notify(t.actionFailed))
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
    </Box>
  )
}
