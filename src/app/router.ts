export type AppKind = 'landing' | 'customer' | 'business'

/** The only host/path policy. Overrides also make local browser tests explicit. */
export function resolveApp(url: URL): AppKind {
  const override = url.searchParams.get('app')
  if (override === 'landing' || override === 'customer' || override === 'business') return override
  if (url.hostname === 'business.chalkboard.shreyaan.work' || url.hostname.endsWith('.run.app'))
    return 'business'
  if (/^\/(explore(?:\/|$)|discover\/?$|s\/)/.test(url.pathname)) return 'customer'
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return 'business'
  return 'landing'
}

export function canonicalCustomerPath(path: string): string {
  if (/^\/discover\/?$/.test(path)) return '/explore/'
  if (path.startsWith('/s/')) return '/explore' + path
  return path
}

export function customerShopLink(id: string, origin: string): string {
  return `${origin}/explore/s/${encodeURIComponent(id)}`
}

/** Public configuration only; never infer the customer origin from the owner host. */
export function safeCustomerOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    if (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
      return url.origin
  } catch {
    /* Invalid public configuration disables sharing links. */
  }
  return null
}
