import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Typography, useTheme } from '@mui/material'
import type { Place } from './types'

type Marker = {
  map: unknown
  addListener: (name: string, listener: () => void) => { remove: () => void }
}
type MapsSdk = {
  importLibrary: (name: string) => Promise<{
    Map: new (node: HTMLElement, options: object) => unknown
    AdvancedMarkerElement: new (options: object) => Marker
  }>
}
type MapsWindow = Window & { google?: { maps: MapsSdk }; chalkboardMapsReady?: () => void }
let sdk: Promise<MapsSdk> | undefined
function loadMaps(key: string): Promise<MapsSdk> {
  if (sdk) return sdk
  sdk = new Promise((resolve, reject) => {
    const host = window as MapsWindow
    if (host.google?.maps) {
      resolve(host.google.maps)
      return
    }
    const script = document.createElement('script')
    const timer = window.setTimeout(() => fail(), 15_000)
    function fail() {
      clearTimeout(timer)
      script.remove()
      delete host.chalkboardMapsReady
      sdk = undefined
      reject(new Error('Map unavailable'))
    }
    host.chalkboardMapsReady = () => {
      clearTimeout(timer)
      delete host.chalkboardMapsReady
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
        callback: 'chalkboardMapsReady',
      })
    script.onerror = fail
    document.head.appendChild(script)
  })
  return sdk
}

/** No SDK or Google request until the customer opens Map view. List remains the accessible alternative. */
export default function DiscoverMap({
  places,
  center,
  demo,
  onOpen,
  unavailable,
  loading,
  demoLabel,
}: {
  places: Place[]
  center: { lat: number; lng: number }
  demo: boolean
  onOpen: (place: Place) => void
  unavailable: string
  loading: string
  demoLabel: string
}) {
  const roles = useTheme().material
  const container = useRef<HTMLDivElement>(null)
  const onOpenRef = useRef(onOpen)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const lat = center.lat,
    lng = center.lng
  useEffect(() => {
    onOpenRef.current = onOpen
  }, [onOpen])
  useEffect(() => {
    if (demo) return
    const abort = new AbortController()
    const markers: Marker[] = []
    const listeners: { remove: () => void }[] = []
    const node = container.current
    async function show() {
      setState('loading')
      try {
        const response = await fetch('/api/v1/bootstrap', { signal: abort.signal })
        if (!response.ok) throw new Error('Configuration unavailable')
        const config = (await response.json()) as { maps_browser_key?: string; maps_mode?: string }
        if (abort.signal.aborted) return
        if (!config.maps_browser_key || config.maps_mode !== 'live')
          throw new Error('Map not connected')
        const maps = await loadMaps(config.maps_browser_key)
        const [mapLibrary, markerLibrary] = await Promise.all([
          maps.importLibrary('maps'),
          maps.importLibrary('marker'),
        ])
        if (abort.signal.aborted || !node) return
        const map = new mapLibrary.Map(node, {
          center: { lat, lng },
          zoom: 14,
          mapId: 'DEMO_MAP_ID',
          gestureHandling: 'cooperative',
        })
        for (const place of places) {
          const marker = new markerLibrary.AdvancedMarkerElement({
            map,
            position: { lat: place.lat, lng: place.lng },
            title: place.name,
          })
          listeners.push(
            marker.addListener('click', () => {
              onOpenRef.current(place)
              if (place.source === 'chalkboard')
                location.assign('/explore/s/' + encodeURIComponent(place.id))
            }),
          )
          markers.push(marker)
        }
        setState('ready')
      } catch {
        if (!abort.signal.aborted) setState('error')
      }
    }
    void show()
    return () => {
      abort.abort()
      listeners.forEach((listener) => listener.remove())
      markers.forEach((marker) => {
        marker.map = null
      })
      node?.replaceChildren()
    }
  }, [lat, lng, places, demo])
  if (demo)
    return (
      <Box>
        <Alert severity="info">{demoLabel}</Alert>
        <Box
          component="svg"
          viewBox="0 0 400 300"
          aria-hidden="true"
          sx={{
            width: '100%',
            display: 'block',
            mt: 3,
            borderRadius: 4,
            bgcolor: roles.surfaceContainerHigh,
          }}
        >
          <path
            d="M0 100h400M0 200h400M100 0v300M260 0v300"
            stroke={roles.outlineVariant}
            strokeWidth="16"
            fill="none"
          />
          {places.map((place) => (
            <g
              key={place.id}
              transform={`translate(${Math.max(32, Math.min(360, 200 + (place.lng - lng) * 10000))}, ${Math.max(32, Math.min(260, 150 - (place.lat - lat) * 10000))})`}
            >
              <circle r="18" fill={roles.primary} />
              <circle r="6" fill={roles.onPrimary} />
            </g>
          ))}
        </Box>
      </Box>
    )
  return (
    <Box>
      {state === 'error' ? (
        <Alert severity="warning">{unavailable}</Alert>
      ) : (
        state === 'loading' && <Typography role="status">{loading}</Typography>
      )}
      <Box
        ref={container}
        sx={{ height: 360, width: '100%', display: state === 'error' ? 'none' : 'block' }}
      />
    </Box>
  )
}
