import { useEffect, type ReactNode } from 'react'
import { Box, Stack, Typography, useTheme, type Theme } from '@mui/material'
import { ExternalLink, Leaf, MapPinned } from 'lucide-react'
import type { Locale } from '../../i18n/locales'
import { dealIn } from '../../design/chalkMotion'
import { HAND_FONT } from '../../design/theme'
import { customerNavigate } from '../frontdoors/navigation'
import { PlaceImage } from '../frontdoors/PlaceImage'
import { accountCopyFor } from '../customer/copy'
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

/** The answer's places as one vertical list: compact rows, five or so to a phone screen. */
export function PickList({
  label,
  busy = false,
  children,
}: {
  label: string
  busy?: boolean
  children: ReactNode
}) {
  return (
    <Box
      component="ul"
      aria-label={label}
      aria-busy={busy}
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        mt: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {children}
    </Box>
  )
}

/** The square thumbnail of a row, with the number that matches its map pin. */
function Thumb({
  pick,
  number,
  transition = false,
}: {
  pick: AskPick
  number?: number
  transition?: boolean
}) {
  const roles = useTheme().material
  return (
    <Box
      sx={{
        position: 'relative',
        width: 64,
        height: 64,
        flexShrink: 0,
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <PlaceImage
        id={pick.id}
        category={pick.category}
        photo={pick.photo_url}
        authors={pick.photo_authors ?? []}
        transition={transition}
        compact
      />
      {number != null && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: 4,
            left: 4,
            width: 20,
            height: 20,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: roles.inverseSurface,
            color: roles.inverseOnSurface,
            typography: 'labelSmall',
            fontWeight: 700,
          }}
        >
          {number}
        </Box>
      )}
    </Box>
  )
}

function rowSx(roles: Theme['material'], selected = false) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    minHeight: 88,
    p: 3,
    color: 'inherit',
    textDecoration: 'none',
    borderRadius: '16px',
    bgcolor: roles.surfaceContainerLow,
    border: `1px solid ${roles.outlineVariant}`,
    boxShadow: selected ? `0 0 0 3px ${roles.primary}` : 'none',
    transition:
      'transform 200ms cubic-bezier(0.2, 0, 0, 1), box-shadow 200ms cubic-bezier(0.2, 0, 0, 1)',
    '&:hover': { bgcolor: roles.surfaceContainer },
    '&:active': { transform: 'scale(0.98)' },
    '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
  }
}

/** One line, cut with an ellipsis rather than making the row taller. */
const oneLine = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const

/**
 * One shop that answers the question, as a compact row: photo, name and the handwritten price
 * of the exact item, the deal (or the item), then open · distance. The whole row opens the shop.
 */
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
  /** Hover or focus the row: the map glides to its pin. */
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
  // The meta line already says "Demo shop"; the name keeps its room for the name itself.
  const name = pick.demo_shop ? pick.name.replace(/\s*\(Demo\)$/, '') : pick.name

  useEffect(() => {
    prefetchPublicShop()
  }, [])

  return (
    <Box
      component="li"
      id={`pick-${pick.id}`}
      sx={{ listStyle: 'none', minWidth: 0, ...dealIn, '--deal-index': index }}
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
        sx={rowSx(roles, selected)}
      >
        <Thumb pick={pick} number={index + 1} transition />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(personal || reason) && (
            <Typography
              variant="labelMedium"
              data-testid="pick-because"
              sx={{ color: roles.primary, fontWeight: 700, ...oneLine }}
            >
              {personal ?? (reason && (accountCopyFor(locale).reasons[reason] ?? reason))}
            </Typography>
          )}
          <Stack direction="row" sx={{ alignItems: 'baseline', gap: 2, minWidth: 0 }}>
            <Typography variant="titleSmall" component="h3" sx={{ flex: 1, ...oneLine }}>
              {name}
            </Typography>
            {item && pick.currency && (
              <Typography
                sx={{
                  fontFamily: HAND_FONT,
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  fontWeight: 700,
                  color: roles.primary,
                  flexShrink: 0,
                }}
              >
                {formatPrice(item.price, pick.currency)}
              </Typography>
            )}
          </Stack>
          {deal && pick.currency ? (
            <Typography
              variant="labelMedium"
              sx={{ color: theme.chalk.coral.onContainer, fontWeight: 700, ...oneLine }}
            >
              {fillIn(copy.deal, {
                item: deal.item,
                price: formatPrice(deal.price, pick.currency),
              })}{' '}
              · {fillIn(copy.until, { time: time(deal.pickup_end, locale) })}
            </Typography>
          ) : item ? (
            <Typography variant="bodySmall" sx={oneLine}>
              {item.name}
              {pick.locally_made && (
                <Box component="span" sx={{ color: theme.chalk.mint.main }}>
                  {' · '}
                  <Leaf size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} />{' '}
                  {locallyMadeLabel(locale)}
                </Box>
              )}
            </Typography>
          ) : null}
          <Typography
            variant="bodySmall"
            color="text.secondary"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}
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
            <Box component="span" sx={oneLine}>
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
    </Box>
  )
}

/** A same-size placeholder row while the area's shops load, so nothing below moves. */
export function PickSkeleton() {
  const roles = useTheme().material
  return (
    <Box
      component="li"
      aria-hidden="true"
      className="c-shimmer"
      sx={{
        listStyle: 'none',
        height: 88,
        borderRadius: '16px',
        bgcolor: roles.surfaceContainerLow,
        border: `1px solid ${roles.outlineVariant}`,
      }}
    />
  )
}

/**
 * Real places from Google Maps, after ours, in the same row shape: Google's photo with its
 * author (Google requires the credit), distance and rating, labelled, opening in Google Maps.
 */
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
    <Box component="section" aria-label={copy.google} sx={{ mt: 5 }}>
      <Typography component="h3" variant="labelLarge" color="text.secondary">
        {copy.google}
      </Typography>
      <PickList label={copy.google}>
        {places.map((place) => (
          <Box component="li" key={place.id} sx={{ listStyle: 'none', minWidth: 0 }}>
            <Box
              component="a"
              href={mapsLink(place.google_maps_uri) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              sx={rowSx(roles)}
            >
              <Thumb pick={place} />
              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="titleSmall" component="h4" sx={oneLine}>
                  {place.name}
                </Typography>
                <Typography variant="bodySmall" color="text.secondary" sx={oneLine}>
                  {[
                    formatDistance(place.distance_m, locale),
                    place.open_now === null ? null : place.open_now ? ask.openNow : ask.closed,
                    // Google's own rating, live and attributed.
                    place.rating != null && place.user_rating_count
                      ? ratingLine(place.rating, place.user_rating_count, locale, search)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                {/* Google's attribution: the words "Google Maps", never translated, and the
                    photo's author. */}
                <Typography
                  variant="labelSmall"
                  translate="no"
                  sx={{ color: roles.onSurfaceVariant, ...oneLine }}
                >
                  Google Maps
                  {place.photo_url && place.photo_authors?.length
                    ? ` · ${place.photo_authors.join(', ')}`
                    : ''}
                </Typography>
              </Box>
              <ExternalLink size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
            </Box>
          </Box>
        ))}
      </PickList>
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
