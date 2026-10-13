export interface Business {
  id: string
  fields: { name: string; category: string; location: string; hours: string; phone: string }
  revision: number
  registration: string
  google_publication: string
}
export interface Product {
  id?: string
  name: string
  price: number
  unit: string
  stock: number | null
}
export interface Proposal {
  id: string
  digest: string
  expires: number
  snapshot: {
    kind: 'business' | 'inventory'
    business_id: string
    revision: number
    business: Business['fields'] | null
    products: Product[]
  }
}
export interface PhotoResult {
  status: 'needs_review' | 'nothing_to_propose'
  photo_kind: string
  extraction: { uncertain: string[] }
  proposal: Proposal | null
}
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
export type Api = <T>(path: string, init?: RequestInit) => Promise<T>
export function makeApi(getToken: () => Promise<string | null>): Api {
  return async <T>(path: string, init: RequestInit = {}) => {
    const token = await getToken()
    const response = await fetch('/api/v1' + path, {
      ...init,
      credentials: 'same-origin',
      signal: init.signal ?? AbortSignal.timeout(25_000),
      headers: {
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) {
      const detail = await response
        .json()
        .then((body: { detail?: unknown }) => (typeof body.detail === 'string' ? body.detail : ''))
        .catch(() => '')
      throw new ApiError(
        response.status === 409
          ? 'These details changed or expired. Review again.'
          : response.status === 503
            ? 'This service is unavailable. Your draft is preserved.'
            : 'Could not complete this action. Your draft is preserved.',
        response.status,
        detail,
      )
    }
    return response.json() as Promise<T>
  }
}
