import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Box, IconButton, Tooltip, Typography, useTheme } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { MapPin, Minus, Plus } from 'lucide-react'
import { motion, shape } from '../../design/theme'
import { useInChatCopy } from './inChatCopy'

export type Point = { lat: number; lng: number }

const TILE = 256
const MIN_ZOOM = 3
const MAX_ZOOM = 19
const clampLat = (lat: number) => Math.max(-85, Math.min(85, lat))

/** Web Mercator, in pixels of the whole world at this zoom. */
function project({ lat, lng }: Point, zoom: number) {
  const size = TILE * 2 ** zoom
  const sin = Math.sin((clampLat(lat) * Math.PI) / 180)
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  }
}
function unproject(x: number, y: number, zoom: number): Point {
  const size = TILE * 2 ** zoom
  const lng = (((x / size) * 360 - 180 + 540) % 360) - 180
  const n = Math.PI - (2 * Math.PI * y) / size
  return { lat: clampLat((180 / Math.PI) * Math.atan(Math.sinh(n))), lng }
}
/** Metres covered by one screen pixel at this latitude and zoom. */
const metresPerPixel = (lat: number, zoom: number) =>
  (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom

type MapsConfig = { key: string; live: boolean }
let config: Promise<MapsConfig> | undefined
function mapsConfig(): Promise<MapsConfig> {
  config ??= fetch('/api/v1/bootstrap')
    .then((response) => response.json())
    .then((data: { maps_browser_key?: string; maps_mode?: string }) => ({
      key: data.maps_browser_key ?? '',
      live: data.maps_mode === 'live' && Boolean(data.maps_browser_key),
    }))
    .catch(() => ({ key: '', live: false }))
  return config
}

type LatLng = { lat: () => number; lng: () => number }
type GoogleMap = {
  getCenter: () => LatLng
  getZoom: () => number
  panTo: (point: Point) => void
  setZoom: (zoom: number) => void
  addListener: (name: string, listener: () => void) => { remove: () => void }
}
type GoogleMaps = {
  importLibrary: (name: 'maps') => Promise<{
    Map: new (node: HTMLElement, options: object) => GoogleMap
  }>
}
type MapsWindow = Window & { google?: { maps: GoogleMaps }; chalkboardPinMapReady?: () => void }
let sdk: Promise<GoogleMaps> | undefined
/** The Maps JavaScript API, loaded once and only when a live browser key exists. */
function loadGoogle(key: string): Promise<GoogleMaps> {
  const host = window as MapsWindow
  if (host.google?.maps) return Promise.resolve(host.google.maps)
  sdk ??= new Promise<GoogleMaps>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => {
      window.clearTimeout(timer)
      script.remove()
      sdk = undefined
      reject(new Error('Map unavailable'))
    }
    const timer = window.setTimeout(fail, 15_000)
    host.chalkboardPinMapReady = () => {
      window.clearTimeout(timer)
      delete host.chalkboardPinMapReady
      if (host.google?.maps) resolve(host.google.maps)
      else fail()
    }
    script.async = true
    script.src =
      'https://maps.googleapis.com/maps/api/js?' +
      new URLSearchParams({
        key,
        v: 'quarterly',
        loading: 'async',
        callback: 'chalkboardPinMapReady',
      })
    script.onerror = fail
    document.head.appendChild(script)
  })
  return sdk
}

/**
 * A map with a fixed pin in the middle: the owner moves the map until the pin sits on the
 * shop (the pattern of Google Maps' "adjust the pin"). Google's map when the app has a live
 * browser key; otherwise OpenStreetMap tiles, and a plain chalk grid if those cannot load,
 * so the pin always works. `onChange` gets the pin each time the map comes to rest.
 */
export function PinMap({
  value,
  onChange,
  accuracy,
  big = false,
  sx,
}: {
  value: Point
  onChange: (point: Point) => void
  /** The phone's measured point and its accuracy, drawn as a circle. */
  accuracy?: (Point & { m: number }) | null
  big?: boolean
  sx?: SxProps<Theme>
}) {
  const [engine, setEngine] = useState<'tiles' | 'google'>('tiles')
  useEffect(() => {
    let alive = true
    void mapsConfig().then((maps) => {
      if (alive && maps.live) setEngine('google')
    })
    return () => {
      alive = false
    }
  }, [])
  return engine === 'google' ? (
    <GooglePinMap
      value={value}
      onChange={onChange}
      big={big}
      sx={sx}
      onFail={() => setEngine('tiles')}
    />
  ) : (
    <TilePinMap value={value} onChange={onChange} accuracy={accuracy} big={big} sx={sx} />
  )
}

function Pin({ lifted }: { lifted: boolean }) {
  const chalk = useTheme().chalk
  return (
    <Box
      aria-hidden="true"
      sx={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none', zIndex: 2 }}
    >
      <Box
        sx={{
          position: 'absolute',
          width: 10,
          height: 5,
          left: -5,
          top: -2.5,
          borderRadius: '50%',
          bgcolor: 'rgba(0,0,0,0.35)',
        }}
      />
      <Box
        data-testid="map-pin"
        sx={{
          position: 'absolute',
          left: -20,
          top: -40,
          color: chalk.sunflower.onMain,
          transform: lifted ? 'translateY(-8px)' : 'none',
          transition: `transform 180ms ${motion.easing.standard}`,
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))',
        }}
      >
        <MapPin size={40} strokeWidth={2} fill={chalk.sunflower.main} />
      </Box>
    </Box>
  )
}

function ZoomButtons({ onZoom }: { onZoom: (delta: number) => void }) {
  const c = useInChatCopy()
  const roles = useTheme().material
  const button = {
    width: 48,
    height: 48,
    bgcolor: roles.surfaceContainerHighest,
    color: roles.onSurface,
    '&:hover': { bgcolor: roles.surfaceContainerHighest, filter: 'brightness(0.96)' },
  }
  return (
    <Box
      sx={{
        position: 'absolute',
        right: 8,
        top: 8,
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Tooltip title={c.zoomIn} placement="left">
        <IconButton aria-label={c.zoomIn} onClick={() => onZoom(1)} sx={button}>
          <Plus size={20} />
        </IconButton>
      </Tooltip>
      <Tooltip title={c.zoomOut} placement="left">
        <IconButton aria-label={c.zoomOut} onClick={() => onZoom(-1)} sx={button}>
          <Minus size={20} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}

function TilePinMap({
  value,
  onChange,
  accuracy,
  big,
  sx,
}: {
  value: Point
  onChange: (point: Point) => void
  accuracy?: (Point & { m: number }) | null
  big: boolean
  sx?: SxProps<Theme>
}) {
  const c = useInChatCopy()
  const theme = useTheme()
  const roles = theme.material
  const dark = theme.palette.mode === 'dark'
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(17)
  const [center, setCenter] = useState(value)
  // The pin as last seen from outside, so a new GPS fix recentres the map.
  const [seen, setSeen] = useState(value)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<number | null>(null)
  const [lifted, setLifted] = useState(false)
  const [tiles, setTiles] = useState({ loaded: 0, failed: 0 })

  if (value.lat !== seen.lat || value.lng !== seen.lng) {
    setSeen(value)
    setCenter(value)
  }
  useLayoutEffect(() => {
    const node = box.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  function settle(next: Point) {
    setSeen(next)
    onChange(next)
  }
  function moveBy(dx: number, dy: number, done: boolean) {
    const at = project(center, zoom)
    const next = unproject(at.x - dx, at.y - dy, zoom)
    setCenter(next)
    if (done) settle(next)
    return next
  }
  function zoomBy(delta: number) {
    setZoom((current) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current + delta)))
  }

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      drag.current = null
      return
    }
    drag.current = { x: event.clientX, y: event.clientY, moved: false }
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch.current !== null && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      if (distance / pinch.current > 1.6 || distance / pinch.current < 0.62) {
        zoomBy(distance > pinch.current ? 1 : -1)
        pinch.current = distance
      }
      return
    }
    const start = drag.current
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved && Math.hypot(dx, dy) < 3) return
    start.moved = true
    setLifted(true)
    drag.current = { x: event.clientX, y: event.clientY, moved: true }
    moveBy(dx, dy, false)
  }
  function up(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    const moved = drag.current?.moved
    drag.current = null
    setLifted(false)
    if (moved) settle(center)
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const step = 64
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    if (moves[event.key]) {
      event.preventDefault()
      const [dx, dy] = moves[event.key]!
      moveBy(dx, dy, true)
    } else if (event.key === '+' || event.key === '=') zoomBy(1)
    else if (event.key === '-') zoomBy(-1)
  }

  const at = project(center, zoom)
  const left = at.x - size.w / 2
  const top = at.y - size.h / 2
  const count = 2 ** zoom
  const items: { key: string; url: string; x: number; y: number }[] = []
  if (size.w > 0)
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx++)
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.h) / TILE); ty++) {
        if (ty < 0 || ty >= count) continue
        const wrapped = ((tx % count) + count) % count
        items.push({
          key: `${zoom}/${tx}/${ty}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`,
          x: tx * TILE - left,
          y: ty * TILE - top,
        })
      }
  const circle = accuracy
    ? (() => {
        const point = project(accuracy, zoom)
        return {
          x: point.x - left,
          y: point.y - top,
          r: Math.max(8, accuracy.m / metresPerPixel(accuracy.lat, zoom)),
        }
      })()
    : null
  const offline = tiles.failed > 0 && tiles.loaded === 0

  return (
    <Box
      ref={box}
      role="application"
      aria-label={c.mapLabel}
      aria-roledescription="map"
      tabIndex={0}
      data-testid="pin-map"
      data-engine="tiles"
      data-lat={center.lat.toFixed(6)}
      data-lng={center.lng.toFixed(6)}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={() => zoomBy(1)}
      onWheel={
        big
          ? (event) => {
              if (Math.abs(event.deltaY) > 4) zoomBy(event.deltaY < 0 ? 1 : -1)
            }
          : undefined
      }
      onKeyDown={key}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: `${shape.md}px`,
        touchAction: 'none',
        cursor: lifted ? 'grabbing' : 'grab',
        userSelect: 'none',
        // The chalk grid shows under the tiles and on its own when they cannot load.
        bgcolor: roles.surfaceContainerHigh,
        backgroundImage: `linear-gradient(${roles.outlineVariant} 1px, transparent 1px), linear-gradient(90deg, ${roles.outlineVariant} 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
        '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
        ...sx,
      }}
    >
      {items.map((tile) => (
        <Box
          key={tile.key}
          component="img"
          src={tile.url}
          alt=""
          draggable={false}
          onLoad={() => setTiles((s) => ({ ...s, loaded: s.loaded + 1 }))}
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden'
            setTiles((s) => ({ ...s, failed: s.failed + 1 }))
          }}
          sx={{
            position: 'absolute',
            left: tile.x,
            top: tile.y,
            width: TILE,
            height: TILE,
            maxWidth: 'none',
            pointerEvents: 'none',
            // A softer night map in dark mode instead of a glaring white one.
            filter: dark ? 'invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9)' : 'none',
          }}
        />
      ))}
      {circle && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            left: circle.x - circle.r,
            top: circle.y - circle.r,
            width: circle.r * 2,
            height: circle.r * 2,
            borderRadius: '50%',
            bgcolor: 'rgba(66, 133, 244, 0.16)',
            border: '2px solid rgba(66, 133, 244, 0.7)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}
      <Pin lifted={lifted} />
      <ZoomButtons onZoom={zoomBy} />
      {offline && (
        <Typography
          variant="bodySmall"
          sx={{
            position: 'absolute',
            left: 8,
            right: 56,
            top: 8,
            zIndex: 3,
            p: 1,
            borderRadius: `${shape.sm}px`,
            bgcolor: roles.surfaceContainerHighest,
            color: roles.onSurface,
          }}
        >
          {c.tilesOffline}
        </Typography>
      )}
      <Box
        sx={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          zIndex: 3,
          px: 0.75,
          bgcolor: roles.surfaceContainerHighest,
          color: roles.onSurface,
          fontSize: 11,
          lineHeight: '18px',
          borderTopLeftRadius: 4,
          '& a': { color: 'inherit' },
        }}
      >
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
          OpenStreetMap
        </a>
      </Box>
    </Box>
  )
}

function GooglePinMap({
  value,
  onChange,
  big,
  sx,
  onFail,
}: {
  value: Point
  onChange: (point: Point) => void
  big: boolean
  sx?: SxProps<Theme>
  onFail: () => void
}) {
  const c = useInChatCopy()
  const roles = useTheme().material
  const node = useRef<HTMLDivElement>(null)
  const map = useRef<GoogleMap | null>(null)
  const [lifted, setLifted] = useState(false)
  const latest = useRef({ onChange, onFail, value })
  useEffect(() => {
    latest.current = { onChange, onFail, value }
  })
  useEffect(() => {
    let alive = true
    const listeners: { remove: () => void }[] = []
    void mapsConfig()
      .then((maps) => loadGoogle(maps.key))
      .then((google) => google.importLibrary('maps'))
      .then(({ Map }) => {
        if (!alive || !node.current) return
        const instance = new Map(node.current, {
          center: latest.current.value,
          zoom: 17,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: big ? 'greedy' : 'cooperative',
          keyboardShortcuts: true,
        })
        map.current = instance
        listeners.push(
          instance.addListener('dragstart', () => setLifted(true)),
          instance.addListener('idle', () => {
            setLifted(false)
            const center = instance.getCenter()
            const point = { lat: center.lat(), lng: center.lng() }
            const last = latest.current.value
            if (Math.abs(point.lat - last.lat) > 1e-7 || Math.abs(point.lng - last.lng) > 1e-7)
              latest.current.onChange(point)
          }),
        )
      })
      .catch(() => {
        if (alive) latest.current.onFail()
      })
    return () => {
      alive = false
      listeners.forEach((listener) => listener.remove())
    }
  }, [big])
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const center = instance.getCenter()
    if (Math.abs(center.lat() - value.lat) > 1e-7 || Math.abs(center.lng() - value.lng) > 1e-7)
      instance.panTo(value)
  }, [value])
  return (
    <Box
      data-testid="pin-map"
      data-engine="google"
      sx={{ position: 'relative', overflow: 'hidden', borderRadius: `${shape.md}px`, ...sx }}
    >
      <Box
        ref={node}
        aria-label={c.mapLabel}
        sx={{ position: 'absolute', inset: 0, bgcolor: roles.surfaceContainerHigh }}
      />
      <Pin lifted={lifted} />
      <ZoomButtons
        onZoom={(delta) => {
          const instance = map.current
          if (instance)
            instance.setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, instance.getZoom() + delta)))
        }}
      />
    </Box>
  )
}
