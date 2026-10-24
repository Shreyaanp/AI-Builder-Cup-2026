/**
 * Google Maps JavaScript API with the existing browser key: loaded once, only when a map is
 * shown, and only in live maps mode. Every caller has a local fallback when this rejects.
 */
import { loadBootstrap } from '../../api/appConfig'
export type LatLng = { lat: number; lng: number }
export type MapsListener = { remove: () => void }
export type GoogleMap = {
  panTo: (point: LatLng) => void
  setCenter: (point: LatLng) => void
  getZoom: () => number | undefined
  setZoom: (zoom: number) => void
  fitBounds: (bounds: unknown, padding?: number | object) => void
  addListener: (name: string, listener: () => void) => MapsListener
}
export type AdvancedMarker = {
  map: unknown
  zIndex: number | null
  /** Advanced markers are elements: they say `gmp-click` (the old `click` listener is deprecated). */
  addEventListener: (name: 'gmp-click', listener: () => void) => void
  removeEventListener: (name: 'gmp-click', listener: () => void) => void
}
type Libraries = {
  Map: new (node: HTMLElement, options: object) => GoogleMap
  AdvancedMarkerElement: new (options: object) => AdvancedMarker
  LatLngBounds: new () => { extend: (point: LatLng) => void }
}
type MapsSdk = { importLibrary: (name: string) => Promise<Partial<Libraries>> }
type MapsWindow = Window & { google?: { maps: MapsSdk }; chalkboardMapsReady?: () => void }

let sdk: Promise<MapsSdk> | undefined
let config: Promise<string> | undefined

function loadScript(key: string): Promise<MapsSdk> {
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

/** The browser key, only when the server runs live maps (demo mode never loads Google). */
function browserKey(): Promise<string> {
  // The page's one shared configuration read (A-4).
  config ??= loadBootstrap()
    .then((data) => {
      if (!data.maps_browser_key || data.maps_mode !== 'live') throw new Error('Map not connected')
      return data.maps_browser_key
    })
    .catch((error: unknown) => {
      config = undefined
      throw error
    })
  return config
}

export async function loadMaps(): Promise<Libraries> {
  const maps = await loadScript(await browserKey())
  const [core, marker] = await Promise.all([
    maps.importLibrary('maps'),
    maps.importLibrary('marker'),
  ])
  const coreLib = await maps.importLibrary('core')
  if (!core.Map || !marker.AdvancedMarkerElement || !coreLib.LatLngBounds)
    throw new Error('Map unavailable')
  return {
    Map: core.Map,
    AdvancedMarkerElement: marker.AdvancedMarkerElement,
    LatLngBounds: coreLib.LatLngBounds,
  }
}
