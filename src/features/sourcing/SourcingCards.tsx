import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import {
  CalendarClock,
  Check,
  CircleAlert,
  MessageSquare,
  PackageCheck,
  Send,
  Store,
  Truck,
} from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { productName } from '../../i18n/productNames'
import { useOrderUnit } from '../supply/supplyData'
import { enterRise, fieldFade, motion, shape } from '../../design/theme'
import { formatShopPrice, toMinor } from '../v1/format'
import { formatMoneyText } from '../inquiries/formatMoneyText'
import { useGrowCopy } from '../v1/growCopy'
import { ChangeAmount } from '../supply/ChangeAmount'
import { useWorkspace } from '../v1/workspaceContext'
import { useSourcingCopy } from './copy'
import { sampleWord } from './sampleWord'
import { deliveryLabel } from './orderData'
import { supplyChanged } from '../supply/supplyEvents'
import type { Order, OrderStatus, SupplierCard, SupplierResult } from './types'

const easeOut = motion.easing.emphasizedDecelerate

/** A labelled chip: simulated suppliers are never presented as real. */
export function DemoChip() {
  const roles = useTheme().material
  const s = useSourcingCopy()
  const locale = useLocale()
  const { demo } = useWorkspace()
  return (
    <Chip
      component="span"
      size="small"
      label={demo ? s.demo : sampleWord[locale]}
      sx={{
        height: 22,
        flexShrink: 0,
        bgcolor: roles.tertiaryContainer,
        color: roles.onTertiaryContainer,
        fontWeight: 600,
        '& .MuiChip-label': { px: 2 },
      }}
    />
  )
}

export function StatusChip({ status, replaced }: { status: OrderStatus; replaced?: boolean }) {
  const roles = useTheme().material
  const s = useSourcingCopy()
  const tone: Record<OrderStatus, [string, string]> = {
    draft: [roles.surfaceContainerHighest, roles.onSurfaceVariant],
    sent: [roles.secondaryContainer, roles.onSecondaryContainer],
    confirmed: [roles.primaryContainer, roles.onPrimaryContainer],
    needs_reply: [roles.tertiaryContainer, roles.onTertiaryContainer],
    cancelled: [roles.surfaceContainerHighest, roles.onSurfaceVariant],
    replaced: [roles.surfaceContainerHighest, roles.onSurfaceVariant],
    received: [roles.primaryContainer, roles.onPrimaryContainer],
  }
  const icon =
    status === 'confirmed' || status === 'received' ? (
      <Check size={14} />
    ) : status === 'needs_reply' ? (
      <CircleAlert size={14} />
    ) : status === 'sent' ? (
      <Send size={13} />
    ) : undefined
  return (
    <Chip
      // Re-keyed so a new status fades in over the old one.
      key={status}
      component="span"
      size="small"
      icon={icon}
      label={replaced && status === 'replaced' ? s.replacedChip : s.status[status]}
      sx={{
        height: 24,
        flexShrink: 0,
        bgcolor: tone[status][0],
        color: tone[status][1],
        '& .MuiChip-icon': { color: 'inherit', ml: 1.5 },
        ...fieldFade,
      }}
    />
  )
}

/** "Searching nearby suppliers…": a radar pulse over the shop pin and shimmering placeholders
 * where the supplier cards will land. */
export function SearchingSuppliers({ item }: { item: string }) {
  const roles = useTheme().material
  const s = useSourcingCopy()
  const ring = (delay: number) => ({
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: `2px solid ${roles.primary}`,
    animation: `radarPing 1.8s ${easeOut} ${delay}ms infinite`,
    '@keyframes radarPing': {
      from: { opacity: 0.7, transform: 'scale(0.35)' },
      to: { opacity: 0, transform: 'scale(1.5)' },
    },
  })
  const shimmer = {
    background: `linear-gradient(90deg, ${roles.surfaceContainer} 0%, ${roles.surfaceContainerHighest} 50%, ${roles.surfaceContainer} 100%)`,
    backgroundSize: '200% 100%',
    animation: 'cardShimmer 1.4s linear infinite',
    '@keyframes cardShimmer': {
      from: { backgroundPosition: '100% 0' },
      to: { backgroundPosition: '-100% 0' },
    },
  }
  return (
    <Box component="li" role="status" aria-live="polite" sx={{ pl: 10, ...enterRise }}>
      <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
        <Box sx={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }} aria-hidden="true">
          <Box sx={ring(0)} />
          <Box sx={ring(600)} />
          <Box sx={ring(1200)} />
          <Box
            sx={{
              position: 'absolute',
              inset: 12,
              borderRadius: '50%',
              bgcolor: roles.primary,
              color: roles.onPrimary,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Store size={10} />
          </Box>
        </Box>
        <Typography variant="bodyLarge" color="text.secondary">
          {s.searching(item)}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={3} sx={{ mt: 3, overflow: 'hidden' }} aria-hidden="true">
        {[0, 1].map((index) => (
          <Box
            key={index}
            sx={{
              flex: '0 0 min(78%, 280px)',
              height: 236,
              borderRadius: `${shape.lg}px`,
              ...shimmer,
              animationDelay: `${index * 160}ms`,
            }}
          />
        ))}
      </Stack>
    </Box>
  )
}

/** Rows shown before "Show N more" (PLAN-COACH-POC §2a). */
const VENDORS_SHOWN = 3

/**
 * The vendor list (PLAN-COACH-POC slice 1, simplify batch 4b): suppliers for one item as rows,
 * best first, never wider than the phone. Each row says price per unit, the estimate for the
 * owner's amount, distance and delivery; Order sends "Order from number N" to the coach, which
 * prepares the order card with Send. The Buy stock sheet's Find a supplier lands here.
 */
export function VendorListCard({
  result,
  onChoose,
}: {
  result: SupplierResult
  onChoose: (card: SupplierCard) => void
}) {
  const roles = useTheme().material
  const s = useSourcingCopy()
  const grow = useGrowCopy()
  const locale = useLocale()
  const unit = useOrderUnit()
  const [all, setAll] = useState(false)
  const km = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const money = (major: number) =>
    formatShopPrice(toMinor(major, result.currency), result.currency, locale)
  const anyDemo = result.suppliers.some((card) => card.demo)
  const shown = all ? result.suppliers : result.suppliers.slice(0, VENDORS_SHOWN)
  const more = result.suppliers.length - shown.length
  return (
    <Box
      sx={{
        pl: { xs: 0, sm: 10 },
        minWidth: 0,
        width: '100%',
        ...enterRise,
      }}
    >
      <Box
        sx={{
          borderRadius: `${shape.lg}px`,
          bgcolor: roles.surfaceContainerLow,
          border: `1px solid ${roles.outlineVariant}`,
          overflow: 'hidden',
        }}
      >
        <Stack spacing={1} sx={{ px: 4, pt: 3, pb: 2 }}>
          <Typography variant="titleSmall">{s.suppliersNear(result.suppliers.length)}</Typography>
          {anyDemo && (
            <Typography variant="bodySmall" color="text.secondary">
              {s.demoNote}
            </Typography>
          )}
        </Stack>
        <Box
          component="ul"
          role="list"
          aria-label={s.suppliersNear(result.suppliers.length)}
          sx={{
            m: 0,
            p: 0,
            listStyle: 'none',
            '& > li': { borderTop: `1px solid ${roles.outlineVariant}` },
          }}
        >
          {shown.map((card, index) => (
            <Box
              component="li"
              key={card.id}
              sx={{
                px: 4,
                py: 3,
                display: 'grid',
                gridTemplateColumns: '28px minmax(0, 1fr)',
                columnGap: 3,
                rowGap: 1,
                '@keyframes vendorIn': {
                  from: { opacity: 0, transform: 'translateY(8px)' },
                  to: { opacity: 1, transform: 'none' },
                },
                animation: `vendorIn ${motion.duration.enter}ms ${easeOut} ${index * 60}ms both`,
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: index === 0 ? roles.primary : roles.secondaryContainer,
                  color: index === 0 ? roles.onPrimary : roles.onSecondaryContainer,
                  typography: 'labelLarge',
                }}
              >
                {card.rank}
              </Box>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Typography
                  variant="bodyLarge"
                  sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: 'anywhere' }}
                >
                  <Box component="span" sx={visuallyHidden}>
                    {card.rank}.{' '}
                  </Box>
                  {card.name}
                </Typography>
                {card.demo && <DemoChip />}
              </Stack>
              <Stack
                direction="row"
                sx={{
                  gridColumn: 2,
                  columnGap: 2,
                  flexWrap: 'wrap',
                  alignItems: 'baseline',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Typography variant="bodyLarge" sx={{ fontWeight: 600 }}>
                  {s.perUnit(money(card.item.price), unit(card.item.unit))}
                </Typography>
                {card.estimate != null && (
                  <Typography variant="bodySmall" sx={{ color: roles.primary }}>
                    {s.about(money(card.estimate))}
                  </Typography>
                )}
                {!card.item.available && (
                  <Chip size="small" label={s.outOfStock} sx={{ height: 20 }} component="span" />
                )}
              </Stack>
              <Typography
                variant="bodySmall"
                color="text.secondary"
                sx={{ gridColumn: 2, overflowWrap: 'anywhere' }}
              >
                {[
                  productName(card.item.name, locale),
                  s.km(km.format(card.distance_km)),
                  card.delivery,
                  card.min_order,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
              {card.in_stock.length > 0 && (
                <Typography
                  variant="bodySmall"
                  color="text.secondary"
                  sx={{ gridColumn: 2, overflowWrap: 'anywhere' }}
                >
                  {s.alsoStocks}:{' '}
                  {card.in_stock.map((name) => productName(name, locale)).join(', ')}
                </Typography>
              )}
              <Button
                variant={index === 0 ? 'contained' : 'outlined'}
                onClick={() => onChoose(card)}
                sx={{ gridColumn: 2, justifySelf: 'start', minHeight: 48, mt: 1 }}
              >
                {grow.order}
              </Button>
            </Box>
          ))}
        </Box>
        {more > 0 && (
          <Button
            onClick={() => setAll(true)}
            sx={{
              width: '100%',
              minHeight: 48,
              borderRadius: 0,
              borderTop: `1px solid ${roles.outlineVariant}`,
            }}
          >
            {grow.showMore(more)}
          </Button>
        )}
      </Box>
      {result.approximate_location && (
        <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 2 }}>
          {s.approximate}
        </Typography>
      )}
    </Box>
  )
}

/**
 * The order request in the chat. One tap on Send delivers it; the card then flies into its
 * "sent" state, and the supplier's reply appears on it when it arrives.
 */
export function OrderCard({
  order,
  onSend,
  onDiscard,
  onOpen,
  onReceived,
  onChanged,
}: {
  order: Order
  onSend: (order: Order) => Promise<boolean>
  onDiscard: (order: Order) => Promise<void>
  onOpen: (order: Order) => void
  onReceived: (order: Order) => void
  /** The owner changed the amount on the card: the same draft, updated. */
  onChanged: (order: Order) => void
}) {
  const roles = useTheme().material
  const s = useSourcingCopy()
  const locale = useLocale()
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  // Plays the flight once, when this card's own Send succeeds.
  const [flying, setFlying] = useState(false)
  const unit = useOrderUnit()
  const money = (minor: number) => formatShopPrice(minor, order.currency, locale)
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const actionable = order.status === 'draft' || Boolean(order.pending)
  const reply = [...order.messages].reverse().find((message) => message.author === 'supplier')
  const waiting = !actionable && order.reply_due != null && order.status === 'sent'
  async function send() {
    setBusy(true)
    const ok = await onSend(order)
    setBusy(false)
    if (ok) {
      setFlying(true)
      window.setTimeout(() => setFlying(false), 900)
    }
  }
  return (
    <Box sx={{ pl: { xs: 0, sm: 10 }, ...enterRise }}>
      <Box
        sx={{
          position: 'relative',
          borderRadius: `${shape.xl}px`,
          bgcolor: actionable ? roles.surfaceContainerLow : roles.surfaceContainer,
          border: `1px solid ${actionable ? roles.primary : roles.outlineVariant}`,
          p: 4,
          overflow: 'hidden',
          transition: `background-color ${motion.duration.medium}ms ${motion.easing.standard}, border-color ${motion.duration.medium}ms`,
          ...(flying && {
            '@keyframes orderFly': {
              '0%': { transform: 'none' },
              '35%': { transform: 'translateY(-10px) scale(0.97)' },
              '100%': { transform: 'none' },
            },
            animation: `orderFly 700ms ${motion.easing.emphasized}`,
          }),
        }}
      >
        {flying && (
          // The request leaving: a paper plane takes off from the Send button.
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              right: 28,
              bottom: 28,
              color: roles.primary,
              '@keyframes planeAway': {
                '0%': { opacity: 1, transform: 'none' },
                '100%': {
                  opacity: 0,
                  transform: 'translate(140px, -160px) rotate(-12deg) scale(1.4)',
                },
              },
              animation: `planeAway 800ms ${motion.easing.emphasizedAccelerate} both`,
            }}
          >
            <Send size={28} />
          </Box>
        )}
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
          <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
            {order.status === 'confirmed' ? <PackageCheck size={20} /> : <Truck size={20} />}
          </Box>
          <Typography variant="labelLarge" color="text.secondary" sx={{ flex: 1 }}>
            {s.orderRequest}
          </Typography>
          <StatusChip status={order.status} replaced={Boolean(order.replaced_by)} />
        </Stack>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
          <Typography variant="titleMedium" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {order.supplier.name}
          </Typography>
          {order.supplier.demo && <DemoChip />}
        </Stack>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
          {order.lines.map((line, index) => (
            <Stack
              component="li"
              key={`${line.name}-${index}`}
              direction="row"
              spacing={2}
              sx={{ alignItems: 'baseline' }}
            >
              <Typography
                variant="bodyLarge"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  color: line.price == null ? 'text.secondary' : 'text.primary',
                  textDecoration: line.price == null ? 'line-through' : undefined,
                }}
              >
                <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {number.format(line.quantity)} {unit(line.unit)}
                </Box>{' '}
                {productName(line.name, locale)}
              </Typography>
              <Typography
                variant="bodyLarge"
                sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
              >
                {line.total == null ? s.notStocked : money(line.total)}
              </Typography>
            </Stack>
          ))}
        </Box>
        <Divider sx={{ my: 3, borderColor: roles.outlineVariant }} />
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Typography variant="labelLarge" color="text.secondary">
            {s.estimatedTotal}
          </Typography>
          <Typography variant="titleLarge" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {money(order.total)}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 2 }}>
          <CalendarClock size={16} aria-hidden="true" color={roles.onSurfaceVariant} />
          <Typography variant="bodyMedium" color="text.secondary">
            {s.delivery}: {deliveryLabel(order, locale)}
          </Typography>
        </Stack>
        {order.pending && (
          <Box
            sx={{
              mt: 3,
              p: 3,
              borderRadius: `${shape.md}px`,
              bgcolor: roles.surfaceContainerHigh,
              ...fieldFade,
            }}
          >
            <Typography variant="labelMedium" color="text.secondary">
              {order.pending.kind === 'cancel' ? s.cancelToSend : s.messageToSupplier}
            </Typography>
            <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
              “{order.pending.text}”
            </Typography>
          </Box>
        )}
        {order.status === 'draft' && (
          <Box sx={{ mt: 2 }}>
            <ChangeAmount
              key={order.version}
              disabled={busy}
              rows={order.lines.flatMap((line, index) =>
                line.price == null
                  ? []
                  : [{ key: index, label: line.name, quantity: line.quantity, unit: line.unit }],
              )}
              onSave={async (changes) => {
                try {
                  const next = await ws.api<Order>(
                    `/businesses/${encodeURIComponent(ws.activeId ?? '')}/orders/${encodeURIComponent(order.id)}/edit`,
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        version: order.version,
                        lines: changes.map((row) => ({
                          line: row.key,
                          quantity: row.quantity,
                          unit: row.unit,
                        })),
                      }),
                    },
                  )
                  onChanged(next)
                  supplyChanged()
                  return true
                } catch {
                  ws.notify(s.sendFailed)
                  return false
                }
              }}
            />
          </Box>
        )}
        {actionable ? (
          <Box sx={{ mt: 4 }}>
            <Typography variant="bodySmall" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {s.confirmHint}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
              <Button disabled={busy} onClick={() => void onDiscard(order)}>
                {s.discard}
              </Button>
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => void send()}
                aria-label={s.sendTo(order.supplier.name)}
                startIcon={
                  busy ? <CircularProgress size={16} color="inherit" /> : <Send size={18} />
                }
                sx={{ minHeight: 48, px: 6 }}
              >
                {busy ? s.sending : s.send}
              </Button>
            </Stack>
          </Box>
        ) : order.status === 'replaced' ? (
          <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 3, ...fieldFade }}>
            {order.replaced_by ? s.replacedByEdit : s.discarded}
          </Typography>
        ) : (
          <Box sx={{ mt: 3, ...enterRise }}>
            {reply ? (
              <Box
                key={reply.id}
                sx={{
                  p: 3,
                  borderRadius: `${shape.md}px`,
                  bgcolor: roles.surfaceContainerHigh,
                  ...enterRise,
                }}
              >
                <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
                  {formatMoneyText(reply.text, locale)}
                </Typography>
                {reply.auto && (
                  <Typography variant="labelSmall" color="text.secondary">
                    {s.autoReply}
                  </Typography>
                )}
              </Box>
            ) : (
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Check size={18} aria-hidden="true" color={roles.primary} />
                <Typography variant="bodyMedium" sx={{ flex: 1 }}>
                  {s.sentTo(order.supplier.name)}
                  {waiting && (
                    <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                      {s.waiting}
                    </Box>
                  )}
                </Typography>
                {waiting && <CircularProgress size={16} aria-hidden="true" />}
              </Stack>
            )}
            <Stack direction="row" sx={{ mt: 2, ml: -2, flexWrap: 'wrap', gap: 1 }}>
              <Button startIcon={<MessageSquare size={18} />} onClick={() => onOpen(order)}>
                {s.openThread}
              </Button>
              {(order.status === 'confirmed' ||
                order.status === 'sent' ||
                order.status === 'needs_reply') && (
                <Button startIcon={<PackageCheck size={18} />} onClick={() => onReceived(order)}>
                  {s.markReceived}
                </Button>
              )}
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  )
}
