import { useState } from 'react'
import type { ReactNode } from 'react'
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
import {
  CalendarClock,
  Check,
  CircleAlert,
  MapPin,
  MessageSquare,
  PackageCheck,
  Send,
  Store,
  Truck,
} from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { enterRise, fieldFade, motion, shape } from '../../design/theme'
import { formatPrice, toMinor } from '../v1/format'
import { useSourcingCopy } from './copy'
import { deliveryLabel } from './orderData'
import type { Order, OrderStatus, SupplierCard, SupplierResult } from './types'

const easeOut = motion.easing.emphasizedDecelerate

/** A labelled "Demo" chip: simulated suppliers are never presented as real. */
export function DemoChip() {
  const roles = useTheme().material
  const s = useSourcingCopy()
  return (
    <Chip
      component="span"
      size="small"
      label={s.demo}
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

export function StatusChip({ status }: { status: OrderStatus }) {
  const roles = useTheme().material
  const s = useSourcingCopy()
  const tone: Record<OrderStatus, [string, string]> = {
    draft: [roles.surfaceContainerHighest, roles.onSurfaceVariant],
    sent: [roles.secondaryContainer, roles.onSecondaryContainer],
    confirmed: [roles.primaryContainer, roles.onPrimaryContainer],
    needs_reply: [roles.tertiaryContainer, roles.onTertiaryContainer],
    cancelled: [roles.surfaceContainerHighest, roles.onSurfaceVariant],
    replaced: [roles.surfaceContainerHighest, roles.onSurfaceVariant],
  }
  const icon =
    status === 'confirmed' ? (
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
      label={s.status[status]}
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

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  const roles = useTheme().material
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Box
        aria-hidden="true"
        sx={{ display: 'flex', color: roles.onSurfaceVariant, flexShrink: 0 }}
      >
        {icon}
      </Box>
      <Typography variant="bodySmall" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
        {children}
      </Typography>
    </Stack>
  )
}

/** Supplier cards stagger in as a horizontal carousel inside the conversation. */
export function SupplierCarousel({
  result,
  onChoose,
}: {
  result: SupplierResult
  onChoose: (card: SupplierCard) => void
}) {
  const roles = useTheme().material
  const s = useSourcingCopy()
  const locale = useLocale()
  const km = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const money = (major: number) =>
    formatPrice(toMinor(major, result.currency), result.currency, locale)
  const anyDemo = result.suppliers.some((card) => card.demo)
  return (
    <Box component="li" sx={{ pl: { xs: 0, sm: 10 }, ...enterRise }}>
      <Stack spacing={0.5} sx={{ pl: { xs: 10, sm: 0 }, pb: 2 }}>
        <Typography variant="titleSmall">{s.suppliersNear(result.suppliers.length)}</Typography>
        {anyDemo && (
          <Typography variant="bodySmall" color="text.secondary" sx={{ minWidth: 0 }}>
            {s.demoNote}
          </Typography>
        )}
      </Stack>
      <Box
        role="list"
        aria-label={s.suppliersNear(result.suppliers.length)}
        sx={{
          display: 'flex',
          gap: 3,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: '16px',
          // Bleed to the screen edges on phones so the next card visibly peeks in.
          mx: { xs: -4, sm: 0 },
          px: { xs: 4, sm: 0 },
          pb: 2,
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {result.suppliers.map((card, index) => (
          <Box
            key={card.id}
            role="listitem"
            sx={{
              flex: '0 0 min(78%, 280px)',
              scrollSnapAlign: 'start',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              p: 4,
              borderRadius: `${shape.lg}px`,
              bgcolor: roles.surfaceContainerLow,
              border: `1px solid ${roles.outlineVariant}`,
              '@keyframes supplierIn': {
                from: { opacity: 0, transform: 'translateX(32px) scale(0.96)' },
                to: { opacity: 1, transform: 'none' },
              },
              animation: `supplierIn ${motion.duration.enter + 100}ms ${easeOut} ${index * 90}ms both`,
            }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Box
                aria-hidden="true"
                sx={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
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
              <Typography
                variant="titleSmall"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                <Box component="span" sx={visually}>
                  {card.rank}.{' '}
                </Box>
                {card.name}
              </Typography>
              {card.demo && <DemoChip />}
            </Stack>
            <Row icon={<MapPin size={14} />}>
              {s.km(km.format(card.distance_km))}
              {card.delivery ? ` · ${card.delivery}` : ''}
            </Row>
            <Box>
              <Typography
                variant="titleLarge"
                sx={{ fontVariantNumeric: 'tabular-nums', color: roles.onSurface }}
              >
                {s.perUnit(money(card.item.price), card.item.unit)}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Typography variant="bodyMedium" color="text.secondary" noWrap>
                  {card.item.name}
                </Typography>
                {!card.item.available && (
                  <Chip size="small" label={s.outOfStock} sx={{ height: 20 }} component="span" />
                )}
              </Stack>
            </Box>
            {card.estimate != null && (
              <Typography variant="bodySmall" sx={{ color: roles.primary }}>
                {s.about(money(card.estimate))}
              </Typography>
            )}
            {card.in_stock.length > 0 && (
              <Typography
                variant="bodySmall"
                color="text.secondary"
                sx={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {s.alsoStocks}: {card.in_stock.join(', ')}
              </Typography>
            )}
            <Box sx={{ flex: 1 }} />
            <Stack
              direction="row"
              sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
            >
              <Typography variant="bodySmall" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                {card.min_order}
              </Typography>
              <Button
                size="small"
                variant={index === 0 ? 'contained' : 'outlined'}
                onClick={() => onChoose(card)}
                sx={{ flexShrink: 0, minHeight: 40 }}
              >
                {s.choose}
              </Button>
            </Stack>
          </Box>
        ))}
      </Box>
      {result.approximate_location && (
        <Typography variant="bodySmall" color="text.secondary" sx={{ pl: { xs: 10, sm: 0 } }}>
          {s.approximate}
        </Typography>
      )}
    </Box>
  )
}

const visually = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

/**
 * The order request in the chat. One tap on Send delivers it; the card then flies into its
 * "sent" state, and the supplier's reply appears on it when it arrives.
 */
export function OrderCard({
  order,
  onSend,
  onDiscard,
  onOpen,
}: {
  order: Order
  onSend: (order: Order) => Promise<boolean>
  onDiscard: (order: Order) => Promise<void>
  onOpen: (order: Order) => void
}) {
  const roles = useTheme().material
  const s = useSourcingCopy()
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  // Plays the flight once, when this card's own Send succeeds.
  const [flying, setFlying] = useState(false)
  const money = (minor: number) => formatPrice(minor, order.currency, locale)
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
    <Box component="li" sx={{ pl: { xs: 0, sm: 10 }, ...enterRise }}>
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
          <StatusChip status={order.status} />
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
                  {number.format(line.quantity)} {line.unit}
                </Box>{' '}
                {line.name}
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
            {s.discarded}
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
                  {reply.text}
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
            <Button
              startIcon={<MessageSquare size={18} />}
              onClick={() => onOpen(order)}
              sx={{ mt: 2, ml: -2 }}
            >
              {s.openThread}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  )
}
