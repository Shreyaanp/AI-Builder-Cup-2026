import type { components } from '../../api/generated'

export type Place = components['schemas']['DiscoveryPlace']
export type Discovery = components['schemas']['DiscoveryResponse']
export type Usual = Pick<Place, 'id' | 'name' | 'source' | 'google_maps_uri' | 'demo' | 'demo_shop'>

export function mapsLink(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' &&
      ['www.google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(url.hostname)
    )
      return url.href
  } catch {
    /* Provider URLs are untrusted input. */
  }
  return undefined
}
