import { useEffect } from 'react'
import { Box, Stack, Typography, useTheme } from '@mui/material'
import { ExternalLink, Leaf, TrainFront } from 'lucide-react'
import type { Locale } from '../../i18n/locales'
import { dealIn } from '../../design/chalkMotion'
import { HAND_FONT } from '../../design/theme'
import { customerNavigate } from '../frontdoors/navigation'
import { PlaceImage } from '../frontdoors/PlaceImage'
import { accountCopyFor } from '../customer/copy'
import { FollowButton } from '../customer/FollowButton'
import { locallyMadeLabel } from '../public/locallyMade'
import { formatPrice } from '../v1/format'
import { askCopy } from './askStrings'
import type { AskAnswer, AskPick } from './askThread'
import { fillIn, type ConversationCopy } from './conversationCopy'

const prefetchPublicShop = () => {
  void import('../public/PublicShop')
}

function formatDistance(metres: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: metres < 1000 ? 'meter' : 'kilometer',
    maximumFractionDigits: metres < 1000 ? 0 : 1,
  }).format(metres < 1000 ? Math.round(metres / 10) * 10 : metres / 1000)
}

function time(epoch: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(epoch * 1000),
  )
}

/** One shop that answers the question: the exact item and price first, then how far and open. */
export function PickCard({
  pick,
  index,
  anchor,
  copy,
  locale,
}: {
  pick: AskPick
  index: number
  anchor: AskAnswer['anchor']
  copy: ConversationCopy
  locale: Locale
}) {
  const theme = useTheme()
  const roles = theme.material
  const ask = askCopy(locale)
  const item = pick.matched[0] ?? pick.items.find((i) => i.available)
  const reason = pick.reasons?.[0]
  const distance = formatDistance(pick.distance_m, locale)
  const deal = pick.deal

  useEffect(() => {
    prefetchPublicShop()
  }, [])

  return (
    <Box
      component="li"
      id={`pick-${pick.id}`}
      sx={{
        position: 'relative',
        listStyle: 'none',
        scrollSnapAlign: 'start',
        ...dealIn,
        '--deal-index': index,
      }}
    >
      <Box
        component="a"
        href={`/explore/s/${pick.id}`}
        onClick={customerNavigate}
        onPointerEnter={prefetchPublicShop}
        onFocus={prefetchPublicShop}
        onTouchStart={prefetchPublicShop}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          color: 'inherit',
          textDecoration: 'none',
          borderRadius: '20px',
          overflow: 'hidden',
          bgcolor: roles.surfaceContainerLow,
          border: `1px solid ${roles.outlineVariant}`,
          transition: 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
          '&:active': { transform: 'scale(0.98)' },
          '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
        }}
      >
        <Box sx={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden' }}>
          <PlaceImage
            id={pick.id}
            category={pick.category}
            photo={pick.photo_url}
            authors={pick.photo_authors ?? []}
            transition
            compact
          />
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: roles.inverseSurface,
              color: roles.inverseOnSurface,
              typography: 'labelMedium',
              fontWeight: 700,
            }}
          >
            {index + 1}
          </Box>
        </Box>
        <Box sx={{ p: 4, pt: 3, display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
          {reason && (
            <Typography variant="labelMedium" sx={{ color: roles.primary, fontWeight: 700 }}>
              {accountCopyFor(locale).reasons[reason] ?? reason}
            </Typography>
          )}
          <Typography variant="titleMedium" component="h3" noWrap>
            {pick.name}
          </Typography>
          {item && pick.currency && (
            <Stack direction="row" sx={{ alignItems: 'baseline', gap: 2, minWidth: 0 }}>
              {/* Two lines before cutting: long Tamil/Kannada names stay readable at 360px. */}
              <Typography
                variant="bodyMedium"
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  overflowWrap: 'anywhere',
                }}
              >
                {item.name}
              </Typography>
              <Typography
                sx={{
                  fontFamily: HAND_FONT,
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  fontWeight: 700,
                  color: roles.primary,
                }}
              >
                {formatPrice(item.price, pick.currency)}
              </Typography>
            </Stack>
          )}
          {deal && pick.currency ? (
            <Typography
              variant="labelLarge"
              sx={{
                px: 2,
                py: 1,
                borderRadius: '8px',
                bgcolor: theme.chalk.coral.container,
                color: theme.chalk.coral.onContainer,
              }}
            >
              {fillIn(copy.deal, {
                item: deal.item,
                price: formatPrice(deal.price, pick.currency),
              })}{' '}
              · {fillIn(copy.until, { time: time(deal.pickup_end, locale) })}
            </Typography>
          ) : (
            pick.locally_made && (
              <Stack
                direction="row"
                sx={{ gap: 1, alignItems: 'center', color: theme.chalk.mint.main }}
              >
                <Leaf size={16} aria-hidden="true" />
                <Typography variant="labelLarge">{locallyMadeLabel(locale)}</Typography>
              </Stack>
            )
          )}
          <Typography
            variant="bodySmall"
            color="text.secondary"
            sx={{ mt: 'auto', pt: 1, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            {pick.open_now !== null && (
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  borderRadius: '50%',
                  bgcolor: pick.open_now ? 'var(--customer-open)' : roles.outline,
                }}
              />
            )}
            <Box
              component="span"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {[
                pick.open_now === null ? null : pick.open_now ? ask.openNow : ask.closed,
                anchor ? fillIn(copy.fromStation, { distance, station: anchor.name }) : distance,
                pick.demo_shop ? ask.demo : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Box>
          </Typography>
        </Box>
      </Box>
      {/* A sibling of the link (never nested inside it), floating over the photo. */}
      <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
        <FollowButton id={pick.id} name={pick.name} variant="icon" />
      </Box>
    </Box>
  )
}

/** Google places have no menu here: a quiet list, not competing cards. */
export function GoogleRows({
  places,
  copy,
  locale,
}: {
  places: AskPick[]
  copy: ConversationCopy
  locale: Locale
}) {
  const roles = useTheme().material
  const ask = askCopy(locale)
  return (
    <Box component="section" aria-label={copy.google} sx={{ mt: 6 }}>
      <Typography component="h3" variant="labelLarge" color="text.secondary">
        {copy.google}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 2 }}>
        {places.map((place) => (
          <li key={place.id}>
            <Box
              component="a"
              href={place.google_maps_uri ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                minHeight: 56,
                px: 2,
                mx: -2,
                borderRadius: '12px',
                color: 'inherit',
                textDecoration: 'none',
                '&:hover': { bgcolor: roles.surfaceContainerLow },
                '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: -3 },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="bodyLarge" noWrap>
                  {place.name}
                </Typography>
                <Typography variant="bodySmall" color="text.secondary" noWrap>
                  {[
                    formatDistance(place.distance_m, locale),
                    place.open_now === null ? null : place.open_now ? ask.openNow : ask.closed,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              </Box>
              <ExternalLink size={18} aria-hidden="true" />
            </Box>
          </li>
        ))}
      </Box>
    </Box>
  )
}

/**
 * Where the answers are, relative to you (or the station): drawn locally from the coordinates
 * the answer already has. No map SDK or third-party request; tapping a pin shows its card.
 */
export function MiniMap({
  picks,
  center,
  anchor,
  copy,
}: {
  picks: AskPick[]
  center: { lat: number; lng: number }
  anchor: AskAnswer['anchor']
  copy: ConversationCopy
}) {
  const theme = useTheme()
  const roles = theme.material
  const W = 360
  const H = 132
  const pad = 20
  const points = [
    center,
    ...(anchor ? [anchor] : []),
    ...picks.map((p) => ({ lat: p.lat, lng: p.lng })),
  ]
  const cos = Math.cos((center.lat * Math.PI) / 180)
  const xs = points.map((p) => p.lng * cos)
  const ys = points.map((p) => -p.lat)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const scale = Math.min(
    (W - pad * 2) / Math.max(Math.max(...xs) - minX, 0.002),
    (H - pad * 2) / Math.max(Math.max(...ys) - minY, 0.001),
  )
  const offsetX = (W - (Math.max(...xs) - minX) * scale) / 2
  const offsetY = (H - (Math.max(...ys) - minY) * scale) / 2
  const at = (p: { lat: number; lng: number }) => ({
    x: offsetX + (p.lng * cos - minX) * scale,
    y: offsetY + (-p.lat - minY) * scale,
  })
  const you = at(center)
  const station = anchor ? at(anchor) : null
  return (
    <Box
      sx={{
        mt: 4,
        borderRadius: '16px',
        overflow: 'hidden',
        bgcolor: roles.surfaceContainerLow,
        border: `1px solid ${roles.outlineVariant}`,
      }}
    >
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={copy.map}
        sx={{ display: 'block', width: '100%', height: 'auto', maxHeight: 180 }}
      >
        {/* Chalk grid: a sense of streets, not a street map. */}
        {Array.from({ length: 9 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={(i + 1) * 36}
            x2={(i + 1) * 36}
            y1={0}
            y2={H}
            stroke={roles.outlineVariant}
            strokeWidth={1}
            strokeDasharray="2 6"
          />
        ))}
        {Array.from({ length: 3 }, (_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            x2={W}
            y1={(i + 1) * 33}
            y2={(i + 1) * 33}
            stroke={roles.outlineVariant}
            strokeWidth={1}
            strokeDasharray="2 6"
          />
        ))}
        {station && (
          <g>
            <rect
              x={station.x - 11}
              y={station.y - 11}
              width={22}
              height={22}
              rx={6}
              fill={theme.chalk.sky.main}
            />
            <TrainFront
              x={station.x - 7}
              y={station.y - 7}
              width={14}
              height={14}
              color={theme.chalk.sky.onMain}
            />
          </g>
        )}
        <circle
          cx={you.x}
          cy={you.y}
          r={12}
          fill={roles.primary}
          opacity={0.18}
          className="c-ping"
        />
        <circle
          cx={you.x}
          cy={you.y}
          r={6}
          fill={roles.primary}
          stroke={roles.surface}
          strokeWidth={2}
        />
        {spread(picks.map(at)).map((p, index) => {
          const pick = picks[index]!
          return (
            <g
              key={pick.id}
              style={{ cursor: 'pointer' }}
              onClick={() =>
                document
                  .getElementById(`pick-${pick.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
              }
            >
              <circle cx={p.x} cy={p.y} r={11} fill={roles.inverseSurface} />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill={roles.inverseOnSurface}
              >
                {index + 1}
              </text>
            </g>
          )
        })}
      </Box>
    </Box>
  )
}

/** Shops in one building would hide each other: fan them out around the shared point. */
function spread(points: { x: number; y: number }[]) {
  const placed: { x: number; y: number }[] = []
  for (const point of points) {
    const near = placed.filter((p) => Math.hypot(p.x - point.x, p.y - point.y) < 20).length
    const angle = near * 2.1
    placed.push(
      near ? { x: point.x + Math.cos(angle) * 22, y: point.y + Math.sin(angle) * 22 } : point,
    )
  }
  return placed
}
