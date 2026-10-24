import { useEffect, type ReactNode } from 'react'
import { Box, Stack, Typography, useTheme, type Theme } from '@mui/material'
import { ExternalLink, Leaf, MapPinned } from 'lucide-react'
import type { Locale } from '../../i18n/locales'
import { dealIn } from '../../design/chalkMotion'
import { customerNavigate } from '../frontdoors/navigation'
import { PlaceImage } from '../frontdoors/PlaceImage'
import { accountCopyFor } from '../customer/copy'
import { locallyMadeLabel } from '../public/locallyMade'
import { formatPrice } from '../v1/format'
import { askCopy } from './askStrings'
import { cleanAreaText, plainModelText } from './areaText'
import type { AreaAnswer, AskAnswer, AskPick } from './askThread'
import { mapCopy } from './mapCopy'
import { mapsLink } from './types'
import { fillIn, type ConversationCopy } from './conversationCopy'
import { becauseLine, ratingLine, searchCopy } from './searchCopy'
import { formatDistance } from './formatDistance'

const prefetchPublicShop = () => {
  void import('../public/PublicShop')
}

function time(epoch: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(epoch * 1000),
  )
}

/**
 * The answer's places as one vertical list: compact rows, five or so to a phone screen. As a
 * `carousel` (the front door's shops nearby) it is one swipeable row of big photo cards that
 * runs to the screen edges and snaps card by card.
 */
export function PickList({
  label,
  busy = false,
  carousel = false,
  children,
}: {
  label: string
  busy?: boolean
  carousel?: boolean
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
        flexDirection: carousel ? 'row' : 'column',
        gap: 2,
        ...(carousel && {
          mx: -4,
          px: 4,
          pb: 1,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollPaddingInline: '16px',
          overscrollBehaviorX: 'contain',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }),
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
  big = false,
}: {
  pick: AskPick
  number?: number
  transition?: boolean
  /** The card's full-width photo instead of the row's square. */
  big?: boolean
}) {
  const roles = useTheme().material
  return (
    <Box
      sx={{
        position: 'relative',
        width: big ? '100%' : 64,
        height: big ? 'auto' : 64,
        aspectRatio: big ? '4/3' : undefined,
        flexShrink: 0,
        borderRadius: big ? 0 : '12px',
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
/** Two lines, then an ellipsis: a long place name or credit wraps instead of being cut at one. */
const twoLines = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  overflowWrap: 'anywhere',
} as const

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
  onOpen,
  details,
  numbered = true,
  tile = false,
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
  /** Run on tap, before the shop page opens (a Google place opens its own sheet instead). */
  onOpen?: (event: React.MouseEvent<HTMLElement>) => void
  /** A second quiet line under open · distance: category, stamps, rating. */
  details?: string
  /** The map-pin number on the thumbnail; the full list has no map pins. */
  numbered?: boolean
  /** A big photo card for a carousel (PickList `carousel`), not a row. */
  tile?: boolean
}) {
  const theme = useTheme()
  const roles = theme.material
  const ask = askCopy(locale)
  const item = pick.matched[0] ?? pick.items.find((i) => i.available)
  const reason = pick.reasons?.[0]
  // Their own signal, in one line: Gemini's words for the top picks, else the app's own.
  const personal =
    (pick.why ? plainModelText(pick.why) : null) ??
    (pick.because ? becauseLine(pick.because, searchCopy(locale)) : null)
  const distance = formatDistance(pick.distance_m, locale)
  const deal = pick.deal
  // The meta line already says "Demo shop"; the name keeps its room for the name itself.
  const name = pick.demo_shop ? pick.name.replace(/\s*\(Demo\)$/, '') : pick.name
  // A Google place has no shop page of ours: its row is a button that opens its sheet.
  const external = pick.source === 'google'

  useEffect(() => {
    prefetchPublicShop()
  }, [])

  return (
    <Box
      component="li"
      id={`pick-${pick.id}`}
      sx={{
        listStyle: 'none',
        minWidth: 0,
        ...dealIn,
        '--deal-index': index,
        ...(tile && { flex: '0 0 min(72%, 264px)', scrollSnapAlign: 'start' }),
      }}
    >
      <Box
        component={external ? 'button' : 'a'}
        {...(external ? { type: 'button' } : { href: `/explore/s/${pick.id}` })}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          onOpen?.(event)
          if (!external) customerNavigate(event)
        }}
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
          ...rowSx(roles, selected),
          ...(tile && {
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 0,
            p: 0,
            height: '100%',
            overflow: 'hidden',
            borderRadius: '20px',
          }),
          ...(external && {
            width: '100%',
            font: 'inherit',
            textAlign: 'start',
            cursor: 'pointer',
          }),
        }}
      >
        <Thumb pick={pick} number={numbered ? index + 1 : undefined} transition big={tile} />
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            p: tile ? 3 : 0,
          }}
        >
          {(personal || reason) && (
            <Typography
              variant="labelMedium"
              data-testid="pick-because"
              sx={{ color: roles.primary, fontWeight: 700, overflowWrap: 'anywhere' }}
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
                // The theme's title size, not a size of its own (A-22: three sizes per screen).
                // A span, not the theme's h3: the name beside it is the row's only heading.
                variant="titleMedium"
                component="span"
                sx={{
                  fontWeight: 700,
                  color: roles.primary,
                  flexShrink: 0,
                  lineHeight: theme.typography.titleSmall.lineHeight,
                }}
              >
                {formatPrice(item.price, pick.currency)}
              </Typography>
            )}
          </Stack>
          {item && (
            <Typography variant="bodySmall" sx={{ overflowWrap: 'anywhere' }}>
              {item.name}
              {pick.locally_made && (
                <Box component="span" sx={{ color: theme.chalk.mint.main }}>
                  {' · '}
                  <Leaf size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} />{' '}
                  {locallyMadeLabel(locale)}
                </Box>
              )}
            </Typography>
          )}
          {deal && pick.currency && (
            <Typography
              variant="labelMedium"
              sx={{
                color: theme.chalk.coral.onContainer,
                fontWeight: 700,
                overflowWrap: 'anywhere',
              }}
            >
              {fillIn(copy.deal, {
                item: deal.item,
                price: formatPrice(deal.price, pick.currency),
              })}{' '}
              · {fillIn(copy.until, { time: time(deal.pickup_end, locale) })}
            </Typography>
          )}
          <Typography
            variant="bodySmall"
            color="text.secondary"
            sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}
          >
            {pick.open_now !== null && (
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  width: 8,
                  height: 8,
                  mt: 1.5,
                  flexShrink: 0,
                  borderRadius: '50%',
                  bgcolor: pick.open_now ? 'var(--customer-open)' : roles.outline,
                }}
              />
            )}
            {/* Wraps, never an ellipsis: long Tamil/Kannada status words stay whole. */}
            <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {[
                pick.open_now === null ? null : pick.open_now ? ask.openNow : ask.closed,
                anchor ? fillIn(copy.fromStation, { distance, station: anchor.name }) : distance,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Box>
            {/* Its own element, so the label reads as one on its own (and is found as one). */}
            {pick.demo_shop && (
              <Box
                component="span"
                sx={{ ...oneLine, flexShrink: 0, '&::before': { content: '"· "' } }}
              >
                {ask.demo}
              </Box>
            )}
          </Typography>
          {details && (
            <Typography variant="bodySmall" color="text.secondary" sx={oneLine}>
              {details}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
}

/**
 * A same-size placeholder row while the area's shops load, so nothing below moves. It draws
 * the card's own shape (photo, name, details) so it never reads as an empty outline.
 */
export function PickSkeleton({ tile = false }: { tile?: boolean }) {
  const roles = useTheme().material
  const bar = (width: string) => (
    <Box sx={{ height: 12, width, borderRadius: 1, bgcolor: roles.surfaceContainerHighest }} />
  )
  return (
    <Box
      component="li"
      aria-hidden="true"
      className="c-shimmer"
      sx={{
        listStyle: 'none',
        display: 'flex',
        flexDirection: tile ? 'column' : 'row',
        gap: 2,
        p: tile ? 0 : 2,
        overflow: 'hidden',
        // A carousel card: the photo's 4:3 plus its three text lines.
        ...(tile && { flex: '0 0 min(72%, 264px)', aspectRatio: '4/4.4' }),
        height: tile ? 'auto' : 88,
        borderRadius: tile ? '20px' : '16px',
        bgcolor: roles.surfaceContainerLow,
        border: `1px solid ${roles.outlineVariant}`,
      }}
    >
      <Box
        sx={{
          bgcolor: roles.surfaceContainerHighest,
          ...(tile
            ? { aspectRatio: '4/3', width: '100%' }
            : { width: 56, height: 56, flex: 'none' }),
          borderRadius: tile ? 0 : '12px',
        }}
      />
      <Box sx={{ display: 'grid', gap: 2, alignContent: 'center', flex: 1, p: tile ? 2 : 0 }}>
        {bar('70%')}
        {bar('45%')}
      </Box>
    </Box>
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
              sx={{ ...rowSx(roles), gap: 1, px: 2, py: 2 }}
            >
              <Thumb pick={place} />
              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="titleSmall" component="h4" title={place.name} sx={twoLines}>
                  {place.name}
                </Typography>
                <Typography variant="bodySmall" color="text.secondary" sx={oneLine}>
                  {[
                    formatDistance(place.distance_m, locale),
                    place.open_now === null ? null : place.open_now ? ask.openNow : ask.closed,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                {place.rating != null && place.user_rating_count != null && (
                  <Typography
                    variant="bodySmall"
                    color="text.secondary"
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1.25,
                      minHeight: { xs: '2lh', sm: 0 },
                    }}
                  >
                    {ratingLine(place.rating, place.user_rating_count, locale, search)}
                  </Typography>
                )}
                {/* Google's attribution: the words "Google Maps", never translated. The photo's
                    author is a separate, labelled line, so a name never reads as the owner. */}
                <Typography
                  variant="labelSmall"
                  translate="no"
                  sx={{ color: roles.onSurfaceVariant, ...oneLine }}
                >
                  Google Maps
                </Typography>
                {place.photo_url && place.photo_authors?.length ? (
                  <Typography
                    variant="labelSmall"
                    data-testid="photo-credit"
                    title={fillIn(ask.photoBy, { name: place.photo_authors.join(', ') })}
                    sx={{ color: roles.onSurfaceVariant, ...twoLines }}
                  >
                    {fillIn(ask.photoBy, { name: place.photo_authors.join(', ') })}
                  </Typography>
                ) : null}
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
      <Typography variant="bodyLarge" sx={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
        {cleanAreaText(area.text)}
      </Typography>
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
