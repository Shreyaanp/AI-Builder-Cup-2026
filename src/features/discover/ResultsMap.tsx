import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Stack, Typography, useTheme } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { TrainFront } from 'lucide-react'
import { loadMaps, type AdvancedMarker, type GoogleMap, type LatLng } from './mapsSdk'
import type { MapCopy } from './mapCopy'
import './resultsMap.css'

/** One place on the results map: our shops are numbered like their cards; Google places are not. */
export type MapPin = {
  id: string
  name: string
  kind: 'ours' | 'google'
  lat: number
  lng: number
  open: boolean | null
  label?: string
}

type Props = {
  pins: MapPin[]
  center: LatLng
  anchor?: (LatLng & { name: string }) | null
  selected: string | null
  onSelect: (id: string) => void
  copy: MapCopy
  /** Inline in the conversation (short, page scroll wins) or the full-screen explorer. */
  variant: 'inline' | 'full'
  /** Inline height (any MUI responsive value); the full variant fills its container. */
  height?: number | Record<string, number>
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Every matching place on a real Google map (browser key, live maps mode only), with the
 * customer's position and open-now state on each pin. Pins and cards are linked both ways via
 * `selected` / `onSelect`. Without Google (demo, no key, offline, blocked) the same pins are drawn
 * locally on a chalk street sketch, labelled as straight-line distances.
 */
export function ResultsMap(props: Props) {
  const roles = useTheme().material
  const [live, setLive] = useState<'loading' | 'ready' | 'failed'>('loading')
  return (
    <Box
      sx={{
        position: 'relative',
        height: props.variant === 'full' ? '100%' : (props.height ?? 220),
        overflow: 'hidden',
        borderRadius: props.variant === 'full' ? 0 : '16px',
        bgcolor: roles.surfaceContainerLow,
        border: props.variant === 'full' ? 0 : `1px solid ${roles.outlineVariant}`,
      }}
    >
      {live !== 'ready' && <SketchMap {...props} />}
      <GoogleLayer {...props} onState={setLive} visible={live === 'ready'} />
      {live === 'failed' && (
        <Typography
          variant="labelMedium"
          sx={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            px: 2,
            py: 1,
            borderRadius: '8px',
            bgcolor: roles.surface,
            color: 'text.secondary',
            pointerEvents: 'none',
          }}
        >
          {props.copy.fallback}
        </Typography>
      )}
    </Box>
  )
}

function pinColors(theme: Theme, pin: MapPin) {
  const roles = theme.material
  return pin.kind === 'ours'
    ? { bg: roles.primary, fg: roles.onPrimary }
    : { bg: theme.chalk.lilac.main, fg: theme.chalk.lilac.onMain }
}

function GoogleLayer({
  pins,
  center,
  anchor,
  selected,
  onSelect,
  variant,
  copy,
  onState,
  visible,
}: Props & { onState: (state: 'ready' | 'failed') => void; visible: boolean }) {
  const theme = useTheme()
  const node = useRef<HTMLDivElement>(null)
  const map = useRef<GoogleMap | null>(null)
  const markers = useRef(new Map<string, { marker: AdvancedMarker; el: HTMLElement }>())
  const onSelectRef = useRef(onSelect)
  const onStateRef = useRef(onState)
  useEffect(() => {
    onSelectRef.current = onSelect
    onStateRef.current = onState
  }, [onSelect, onState])
  const dark = theme.palette.mode === 'dark'
  // Rebuild only when the set of places changes, never on selection.
  const key = useMemo(
    () => pins.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.open}`).join('|'),
    [pins],
  )
  const latest = useRef({ pins, center, anchor, copy, theme })
  useEffect(() => {
    latest.current = { pins, center, anchor, copy, theme }
  })

  useEffect(() => {
    let cancelled = false
    const listeners: { remove: () => void }[] = []
    const placed = markers.current
    const container = node.current
    void loadMaps()
      .then((lib) => {
        if (cancelled || !container) return
        const { pins, center, anchor, copy, theme } = latest.current
        const instance = new lib.Map(container, {
          center,
          zoom: 15,
          mapId: 'DEMO_MAP_ID',
          colorScheme: dark ? 'DARK' : 'LIGHT',
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: variant === 'full' ? 'greedy' : 'cooperative',
        })
        map.current = instance
        const bounds = new lib.LatLngBounds()
        bounds.extend(center)
        const you = document.createElement('div')
        you.className = 'rm-you'
        new lib.AdvancedMarkerElement({
          map: instance,
          position: center,
          content: you,
          title: copy.you,
        })
        if (anchor) {
          const station = document.createElement('div')
          station.className = 'rm-station'
          station.textContent = '🚉'
          new lib.AdvancedMarkerElement({
            map: instance,
            position: anchor,
            content: station,
            title: anchor.name,
          })
          bounds.extend(anchor)
        }
        pins.forEach((pin) => {
          const el = document.createElement('div')
          el.className = 'rm-pin'
          el.dataset.kind = pin.kind
          el.dataset.open = String(pin.open)
          const colors = pinColors(theme, pin)
          el.style.setProperty('--pin-bg', colors.bg)
          el.style.setProperty('--pin-fg', colors.fg)
          el.textContent = pin.label ?? ''
          const marker = new lib.AdvancedMarkerElement({
            map: instance,
            position: { lat: pin.lat, lng: pin.lng },
            content: el,
            title: pin.name,
            gmpClickable: true,
            zIndex: pin.kind === 'ours' ? 2 : 1,
          })
          listeners.push(marker.addListener('click', () => onSelectRef.current(pin.id)))
          placed.set(pin.id, { marker, el })
          bounds.extend({ lat: pin.lat, lng: pin.lng })
        })
        if (pins.length) instance.fitBounds(bounds, 48)
        onStateRef.current('ready')
      })
      .catch(() => {
        if (!cancelled) onStateRef.current('failed')
      })
    return () => {
      cancelled = true
      listeners.forEach((listener) => listener.remove())
      placed.forEach(({ marker }) => {
        marker.map = null
      })
      placed.clear()
      map.current = null
      container?.replaceChildren()
    }
  }, [key, center.lat, center.lng, dark, variant])

  // Selection: lift and enlarge the pin, glide the map to it.
  useEffect(() => {
    markers.current.forEach(({ marker, el }, id) => {
      const on = id === selected
      el.dataset.selected = String(on)
      marker.zIndex = on ? 10 : el.dataset.kind === 'ours' ? 2 : 1
    })
    const pin = pins.find((p) => p.id === selected)
    if (pin && map.current) {
      if (reduced()) map.current.setCenter(pin)
      else map.current.panTo(pin)
    }
  }, [selected, pins, visible])

  return (
    <Box
      ref={node}
      role={visible ? 'group' : undefined}
      aria-label={visible ? copy.title : undefined}
      aria-hidden={!visible}
      sx={{
        position: 'absolute',
        inset: 0,
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms cubic-bezier(0.2, 0, 0, 1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    />
  )
}

/**
 * The local fallback: a chalk street sketch fitted to the places, the customer at the centre,
 * numbered shop pins, Google pins in their own colour and open-now rings. No third-party request.
 */
function SketchMap({ pins, center, anchor, selected, onSelect, copy, variant }: Props) {
  const theme = useTheme()
  const roles = theme.material
  // Drawn at the container's own size (1 unit = 1 px): pins stay finger-sized and in view on
  // a phone, a wide desktop column or the full-screen map.
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 360, h: variant === 'full' ? 560 : 220 })
  useEffect(() => {
    const node = svg.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect
      if (box && box.width > 0 && box.height > 0)
        setSize({ w: Math.round(box.width), h: Math.round(box.height) })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const W = size.w
  const H = size.h
  const full = variant === 'full'
  // Room for the close button and the fallback label; pins never touch the edge.
  const pad = full ? 72 : 36
  const points = [center, ...(anchor ? [anchor] : []), ...pins]
  const cos = Math.cos((center.lat * Math.PI) / 180)
  const xs = points.map((p) => p.lng * cos)
  const ys = points.map((p) => -p.lat)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const scale = Math.min(
    (W - pad * 2) / Math.max(Math.max(...xs) - minX, 0.003),
    (H - pad * 2) / Math.max(Math.max(...ys) - minY, 0.002),
  )
  const offsetX = (W - (Math.max(...xs) - minX) * scale) / 2
  const offsetY = (H - (Math.max(...ys) - minY) * scale) / 2
  const at = (p: LatLng) => ({
    x: offsetX + (p.lng * cos - minX) * scale,
    y: offsetY + (-p.lat - minY) * scale,
  })
  const you = at(center)
  const station = anchor ? at(anchor) : null
  const spots = spread(pins.map(at), W, H)
  const chosen = pins.findIndex((p) => p.id === selected)
  return (
    <Box
      component="svg"
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      role="group"
      aria-label={copy.title}
      sx={{
        display: 'block',
        width: '100%',
        height: '100%',
        '--rm-primary': roles.primary,
        '--rm-surface': roles.surface,
        '--rm-on-surface': roles.onSurface,
        '--rm-outline': roles.outline,
      }}
    >
      {/* Streets through where you are: a sense of place, not a street map. */}
      <g stroke={roles.surfaceContainerHighest} strokeLinecap="round" fill="none">
        <path d={`M0 ${you.y + 18} L${W} ${you.y - 26}`} strokeWidth={14} />
        <path d={`M${you.x - 30} 0 L${you.x + 22} ${H}`} strokeWidth={10} />
        <path d={`M0 ${H * 0.22} Q${W / 2} ${H * 0.3} ${W} ${H * 0.18}`} strokeWidth={6} />
        <path d={`M${W * 0.78} 0 L${W * 0.86} ${H}`} strokeWidth={6} />
        <path d={`M${W * 0.12} 0 L${W * 0.2} ${H}`} strokeWidth={5} />
        <path d={`M0 ${H * 0.82} L${W} ${H * 0.9}`} strokeWidth={5} />
      </g>
      {station && (
        <g aria-label={anchor?.name} role="img">
          <rect
            x={station.x - 12}
            y={station.y - 12}
            width={24}
            height={24}
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
      <g role="img" aria-label={copy.you}>
        <circle cx={you.x} cy={you.y} r={14} fill="#1a73e8" opacity={0.2} className="c-ping" />
        <circle cx={you.x} cy={you.y} r={7} fill="#1a73e8" stroke="#ffffff" strokeWidth={2.5} />
      </g>
      {order(spots.length, chosen).map((index) => {
        const spot = spots[index]!
        const pin = pins[index]!
        const colors = pinColors(theme, pin)
        const on = index === chosen
        const r = (on ? 16 : pin.kind === 'ours' ? 12 : 10) + (full ? 2 : 0)
        return (
          <g
            key={pin.id}
            role="button"
            tabIndex={0}
            aria-label={pin.name}
            aria-pressed={on}
            className="rm-sketch-pin"
            data-selected={on}
            onClick={() => onSelect(pin.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(pin.id)
              }
            }}
            style={{ transform: `translate(${spot.x}px, ${spot.y}px)` }}
          >
            {/* A 48px touch target around the smaller drawn pin. */}
            <circle r={24} fill="transparent" pointerEvents="all" />
            {pin.open !== null && (
              <circle
                r={r + 3.5}
                fill="none"
                stroke={pin.open ? 'var(--customer-open, #2e7d32)' : roles.outline}
                strokeWidth={2.5}
              />
            )}
            <circle r={r} fill={colors.bg} stroke={roles.surface} strokeWidth={2} />
            {pin.label ? (
              <text
                y={4}
                textAnchor="middle"
                fontSize={on ? 14 : 12}
                fontWeight={700}
                fill={colors.fg}
              >
                {pin.label}
              </text>
            ) : (
              <circle r={3.5} fill={colors.fg} />
            )}
          </g>
        )
      })}
      {chosen >= 0 && (
        <text
          x={Math.min(W - 8, Math.max(8, spots[chosen]!.x))}
          y={Math.max(14, spots[chosen]!.y - 26)}
          textAnchor={
            spots[chosen]!.x > W - 80 ? 'end' : spots[chosen]!.x < 80 ? 'start' : 'middle'
          }
          fontSize={13}
          fontWeight={600}
          fill={roles.onSurface}
          stroke={roles.surface}
          strokeWidth={4}
          paintOrder="stroke"
          pointerEvents="none"
        >
          {pins[chosen]!.name}
        </text>
      )}
    </Box>
  )
}

/**
 * Shops in one building would hide each other: fan them out on a sunflower spiral around the
 * shared point (each new neighbour a little further out), kept inside the drawing.
 */
/** Paint order: the selected pin last, so it is never under a neighbour. */
function order(count: number, chosen: number) {
  const all = Array.from({ length: count }, (_, i) => i)
  return chosen < 0 ? all : [...all.filter((i) => i !== chosen), chosen]
}

function spread(points: { x: number; y: number }[], width: number, height: number) {
  const placed: { x: number; y: number }[] = []
  const clusters: { x: number; y: number; n: number }[] = []
  for (const point of points) {
    const cluster = clusters.find((c) => Math.hypot(c.x - point.x, c.y - point.y) < 26)
    if (!cluster) {
      clusters.push({ ...point, n: 0 })
      placed.push(point)
      continue
    }
    cluster.n += 1
    const radius = 30 * Math.sqrt(cluster.n)
    const angle = cluster.n * 2.39996
    placed.push({
      x: Math.min(width - 18, Math.max(18, cluster.x + Math.cos(angle) * radius)),
      y: Math.min(height - 18, Math.max(18, cluster.y + Math.sin(angle) * radius)),
    })
  }
  return placed
}

/** Which pin colour means what: one quiet line under the map. */
export function MapLegend({ copy }: { copy: MapCopy }) {
  const theme = useTheme()
  const dot = (color: string) => (
    <Box
      component="span"
      aria-hidden="true"
      sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, flexShrink: 0 }}
    />
  )
  return (
    <Stack
      direction="row"
      sx={{ gap: 4, alignItems: 'center', flexWrap: 'wrap', color: 'text.secondary' }}
    >
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
        {dot(theme.material.primary)}
        <Typography variant="labelMedium">{copy.ours}</Typography>
      </Stack>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
        {dot(theme.chalk.lilac.main)}
        <Typography variant="labelMedium">{copy.google}</Typography>
      </Stack>
    </Stack>
  )
}
