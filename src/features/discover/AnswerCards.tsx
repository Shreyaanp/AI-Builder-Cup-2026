import { useEffect } from 'react'
import { Box, Stack, Typography, useTheme } from '@mui/material'
import { ExternalLink, Leaf, MapPinned } from 'lucide-react'
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
import type { AreaAnswer, AskAnswer, AskPick } from './askThread'
import { mapCopy } from './mapCopy'
import { mapsLink } from './types'
import { fillIn, type ConversationCopy } from './conversationCopy'
import { becauseLine, ratingLine, searchCopy } from './searchCopy'

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
  selected = false,
  onFocusPin,
}: {
  pick: AskPick
  index: number
  anchor: AskAnswer['anchor']
  copy: ConversationCopy
  locale: Locale
  /** Its pin was tapped on the map. */
  selected?: boolean
  /** Hover or focus the card: the map glides to its pin. */
  onFocusPin?: () => void
}) {
  const theme = useTheme()
  const roles = theme.material
  const ask = askCopy(locale)
  const item = pick.matched[0] ?? pick.items.find((i) => i.available)
  const reason = pick.reasons?.[0]
  // Their own signal, in one line: Gemini's words for the top picks, else the app's own.
  const personal = pick.why ?? (pick.because ? becauseLine(pick.because, searchCopy(locale)) : null)
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
        onPointerEnter={() => {
          prefetchPublicShop()
          onFocusPin?.()
        }}
        onFocus={() => {
          prefetchPublicShop()
          onFocusPin?.()
        }}
        onTouchStart={prefetchPublicShop}
        data-selected={selected}
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
          boxShadow: selected ? `0 0 0 3px ${roles.primary}` : 'none',
          transition:
            'transform 200ms cubic-bezier(0.2, 0, 0, 1), box-shadow 200ms cubic-bezier(0.2, 0, 0, 1)',
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
          {(personal || reason) && (
            <Typography
              variant="labelMedium"
              data-testid="pick-because"
              sx={{
                color: roles.primary,
                fontWeight: 700,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {personal ?? (reason && (accountCopyFor(locale).reasons[reason] ?? reason))}
            </Typography>
          )}
          <Typography variant="titleMedium" component="h3" noWrap>
            {pick.name}
          </Typography>
          {item && pick.currency && (
            <Stack direction="row" sx={{ alignItems: 'baseline', gap: 2, minWidth: 0 }}>
              <Typography variant="bodyMedium" noWrap sx={{ flex: 1, minWidth: 0 }}>
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
  const search = searchCopy(locale)
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
                    // Google's own rating, live and attributed; never stored by us.
                    place.rating != null && place.user_rating_count
                      ? ratingLine(place.rating, place.user_rating_count, locale, search)
                      : null,
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
 * Google's live answer to a question about the area (Gemini grounding with Google Maps), with
 * the Google Maps places it used: Google's required attribution, shown right under the text.
 * When the switch is off or Google can't answer, one honest line says so instead.
 */
export function AreaAnswerCard({ area, locale }: { area: AreaAnswer; locale: Locale }) {
  const theme = useTheme()
  const roles = theme.material
  const map = mapCopy(locale)
  if (area.status !== 'ok')
    return (
      <Typography
        variant="bodyMedium"
        color="text.secondary"
        sx={{ mt: 4, display: 'flex', gap: 2, alignItems: 'flex-start' }}
      >
        <MapPinned size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        {area.status === 'off' ? map.areaOff : map.areaUnavailable}
      </Typography>
    )
  return (
    <Box
      component="section"
      aria-label="Google Maps"
      className="c-receive"
      sx={{
        mt: 4,
        p: 4,
        borderRadius: '20px',
        bgcolor: roles.surfaceContainerLow,
        border: `1px solid ${roles.outlineVariant}`,
      }}
    >
      <Typography variant="bodyLarge">{area.text}</Typography>
      {area.sources.length > 0 && (
        <>
          <Typography
            component="h3"
            variant="labelMedium"
            color="text.secondary"
            sx={{ mt: 3, mb: 1 }}
          >
            {map.sources}
          </Typography>
          <Box
            component="ul"
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 2 }}
          >
            {area.sources.map((source) => (
              <li key={source.uri}>
                <Box
                  component={mapsLink(source.uri) ? 'a' : 'span'}
                  href={mapsLink(source.uri)}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 48,
                    px: 3,
                    borderRadius: '12px',
                    border: `1px solid ${roles.outlineVariant}`,
                    color: roles.onSurface,
                    textDecoration: 'none',
                    typography: 'labelLarge',
                    '&:hover': { bgcolor: roles.surfaceContainerHigh },
                    '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
                  }}
                >
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: theme.chalk.lilac.main,
                    }}
                  />
                  {source.title}
                  <ExternalLink size={14} aria-hidden="true" />
                </Box>
              </li>
            ))}
          </Box>
        </>
      )}
      <Stack
        direction="row"
        sx={{ mt: 3, gap: 2, alignItems: 'center', flexWrap: 'wrap', color: 'text.secondary' }}
      >
        {/* Google's attribution: the words "Google Maps", never translated. */}
        <Typography
          variant="labelMedium"
          translate="no"
          sx={{
            fontFamily: 'Roboto, system-ui, sans-serif',
            letterSpacing: 0,
            color: roles.onSurfaceVariant,
          }}
        >
          Google Maps
        </Typography>
        {area.demo && <Typography variant="labelMedium">· {map.demo}</Typography>}
      </Stack>
    </Box>
  )
}
