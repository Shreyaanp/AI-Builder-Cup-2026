import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { ExternalLink, X } from 'lucide-react'
import type { Locale } from '../../i18n/locales'
import { customerNavigate } from '../frontdoors/navigation'
import { formatShopPrice } from '../v1/format'
import { askCopy } from './askStrings'
import { fillIn } from './conversationCopy'
import type { MapCopy } from './mapCopy'
import { MapLegend, ResultsMap, type MapPin } from './ResultsMap'
import type { LatLng } from './mapsSdk'
import { formatDistance } from './formatDistance'

/** A row in the explorer: what the pin is, in the words the card would use. */
export type ExplorerPlace = MapPin & {
  distance_m: number
  /** Our shops: the matched item and price. */
  item?: { name: string; price: number; currency: string } | null
  rating?: number | null
  href?: string | null
  /** A sample shop: its row says so, the same way its card does. */
  demo?: boolean
}

// Bottom sheet stops, as the share of the sheet that shows: peek, half, nearly full.
const STOPS = [0.24, 0.52, 0.9]

/**
 * Phone first: the map fills the screen and the results sit in a draggable bottom sheet (peek,
 * half, full; the handle is also a button). Desktop: results on the left, map on the right.
 * Tap a pin to highlight its row; tap a row to glide the map to its pin.
 */
export function MapExplorer({
  open,
  onClose,
  places,
  center,
  anchor,
  copy,
  locale,
  initial,
}: {
  open: boolean
  onClose: () => void
  places: ExplorerPlace[]
  center: LatLng
  anchor?: (LatLng & { name: string }) | null
  copy: MapCopy
  locale: Locale
  initial?: string | null
}) {
  const theme = useTheme()
  const roles = theme.material
  const wide = useMediaQuery(theme.breakpoints.up('md'))
  const [selected, setSelected] = useState<string | null>(initial ?? null)
  const [stop, setStop] = useState(0)
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ y: number; share: number } | null>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!selected) return
    list.current
      ?.querySelector(`[data-place="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  const share = drag ?? STOPS[stop]!
  const rows = (
    <Box
      component="ul"
      ref={list}
      aria-label={fillIn(copy.count, { count: places.length })}
      sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {places.map((place) => (
        <ExplorerRow
          key={place.id}
          place={place}
          selected={place.id === selected}
          onSelect={() => setSelected(place.id)}
          copy={copy}
          locale={locale}
        />
      ))}
    </Box>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby="results-map-title"
      slotProps={{ paper: { sx: { bgcolor: roles.surface, backgroundImage: 'none' } } }}
    >
      <Box
        sx={{
          position: 'relative',
          height: '100dvh',
          display: wide ? 'grid' : 'block',
          gridTemplateColumns: wide ? '400px 1fr' : undefined,
        }}
      >
        {wide && (
          <Box sx={{ overflowY: 'auto', p: 6, borderRight: `1px solid ${roles.outlineVariant}` }}>
            <Header copy={copy} count={places.length} onClose={onClose} />
            <Box sx={{ mt: 4, mb: 4 }}>
              <MapLegend copy={copy} />
            </Box>
            {rows}
          </Box>
        )}
        {/* Phone: the map sits above the sheet (peek or half), so no pin hides under it. */}
        <Box
          sx={
            wide
              ? { position: 'relative', height: '100dvh' }
              : {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: `calc(${100 - Math.min(share, STOPS[1]!) * 100}dvh + 28px)`,
                }
          }
        >
          <ResultsMap
            pins={places}
            center={center}
            anchor={anchor}
            selected={selected}
            onSelect={(id) => {
              setSelected(id)
              if (!wide && stop === 0) setStop(1)
            }}
            copy={copy}
            variant="full"
          />
        </Box>
        {!wide && (
          <>
            <IconButton
              aria-label={copy.closeMap}
              onClick={onClose}
              sx={{
                position: 'absolute',
                top: 'max(12px, env(safe-area-inset-top))',
                left: 12,
                width: 48,
                height: 48,
                bgcolor: roles.surface,
                color: roles.onSurface,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                '&:hover': { bgcolor: roles.surfaceContainerHigh },
              }}
            >
              <X size={22} />
            </IconButton>
            <Box
              component="section"
              aria-labelledby="results-map-title"
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: '90dvh',
                transform: `translateY(${(1 - share / 0.9) * 90}dvh)`,
                transition: drag === null ? 'transform 320ms cubic-bezier(0.2, 0, 0, 1)' : 'none',
                bgcolor: roles.surfaceContainerLow,
                borderRadius: '28px 28px 0 0',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
                display: 'flex',
                flexDirection: 'column',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <Box
                component="button"
                type="button"
                aria-label={stop === STOPS.length - 1 ? copy.showMap : copy.showList}
                aria-expanded={stop > 0}
                onClick={() => setStop((n) => (n + 1) % STOPS.length)}
                onPointerDown={(event: React.PointerEvent<HTMLButtonElement>) => {
                  start.current = { y: event.clientY, share }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event: React.PointerEvent<HTMLButtonElement>) => {
                  if (!start.current) return
                  const moved = (start.current.y - event.clientY) / window.innerHeight
                  if (Math.abs(moved) < 0.01 && drag === null) return
                  setDrag(Math.min(0.9, Math.max(0.16, start.current.share + moved)))
                }}
                onPointerUp={(event: React.PointerEvent<HTMLButtonElement>) => {
                  const was = start.current
                  start.current = null
                  if (drag === null || !was) return
                  event.preventDefault()
                  const nearest = STOPS.reduce(
                    (best, value, index) =>
                      Math.abs(value - drag) < Math.abs(STOPS[best]! - drag) ? index : best,
                    0,
                  )
                  setStop(nearest)
                  // The click that follows a drag must not also cycle the sheet.
                  requestAnimationFrame(() => setDrag(null))
                }}
                onClickCapture={(event: React.MouseEvent) => {
                  if (drag !== null) event.stopPropagation()
                }}
                sx={{
                  all: 'unset',
                  display: 'grid',
                  placeItems: 'center',
                  minHeight: 48,
                  cursor: 'grab',
                  touchAction: 'none',
                  '&:focus-visible': {
                    outline: `3px solid ${roles.primary}`,
                    outlineOffset: -3,
                    borderRadius: '28px 28px 0 0',
                  },
                }}
              >
                <Box
                  aria-hidden="true"
                  sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: roles.outline }}
                />
              </Box>
              <Box sx={{ px: 4, pb: 3 }}>
                <Header copy={copy} count={places.length} />
                <Box sx={{ mt: 2 }}>
                  <MapLegend copy={copy} />
                </Box>
              </Box>
              <Box
                sx={{
                  flex: 1,
                  overflowY: 'auto',
                  px: 4,
                  pb: 'calc(24px + env(safe-area-inset-bottom))',
                }}
              >
                {rows}
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  )
}

function Header({ copy, count, onClose }: { copy: MapCopy; count: number; onClose?: () => void }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography id="results-map-title" component="h2" variant="titleLarge">
          {copy.title}
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary">
          {fillIn(copy.count, { count })}
        </Typography>
      </Box>
      {onClose && (
        <IconButton aria-label={copy.closeMap} onClick={onClose} sx={{ width: 48, height: 48 }}>
          <X size={22} />
        </IconButton>
      )}
    </Stack>
  )
}

function ExplorerRow({
  place,
  selected,
  onSelect,
  copy,
  locale,
}: {
  place: ExplorerPlace
  selected: boolean
  onSelect: () => void
  copy: MapCopy
  locale: Locale
}) {
  const theme = useTheme()
  const roles = theme.material
  const ask = askCopy(locale)
  const ours = place.kind === 'ours'
  return (
    <Box
      component="li"
      data-place={place.id}
      sx={{
        borderRadius: '16px',
        border: `${selected ? 2 : 1}px solid ${selected ? roles.primary : roles.outlineVariant}`,
        bgcolor: selected ? roles.secondaryContainer : roles.surface,
        transition: 'background-color 200ms ease, border-color 200ms ease',
        scrollMarginBlock: '12px',
      }}
    >
      <Box
        component="button"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          width: '100%',
          display: 'flex',
          gap: 3,
          alignItems: 'center',
          p: 3,
          minHeight: 64,
          cursor: 'pointer',
          borderRadius: '16px',
          '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            width: ours ? 32 : 24,
            height: ours ? 32 : 24,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: ours ? roles.primary : theme.chalk.lilac.main,
            color: ours ? roles.onPrimary : theme.chalk.lilac.onMain,
            typography: 'labelLarge',
            fontWeight: 700,
          }}
        >
          {place.label}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="titleSmall" noWrap>
            {place.name}
          </Typography>
          {place.item && (
            <Typography variant="bodyMedium" noWrap>
              {place.item.name} · {formatShopPrice(place.item.price, place.item.currency)}
            </Typography>
          )}
          <Typography variant="bodySmall" color="text.secondary" noWrap>
            {[
              place.open === null ? null : place.open ? ask.openNow : ask.closed,
              formatDistance(place.distance_m, locale),
              place.rating ? `★ ${place.rating.toFixed(1)}` : null,
              place.demo ? ask.demo : null,
              ours ? null : copy.google,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        </Box>
      </Box>
      {selected && place.href && (
        <Box sx={{ px: 3, pb: 3 }}>
          {ours ? (
            <Button
              component="a"
              href={place.href}
              onClick={customerNavigate}
              variant="contained"
              sx={{ minHeight: 48 }}
            >
              {copy.openShop}
            </Button>
          ) : (
            <Button
              component="a"
              href={place.href}
              target="_blank"
              rel="noopener noreferrer"
              variant="outlined"
              endIcon={<ExternalLink size={16} aria-hidden="true" />}
              sx={{ minHeight: 48 }}
            >
              {copy.openGoogle}
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}
