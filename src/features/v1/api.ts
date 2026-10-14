/** Optional facts customers ask about; absent until the owner confirms them. */
export interface ShopFacts {
  halal?: 'yes' | 'no' | 'muslim_owned' | 'not_stated' | null
  vegetarian_options?: boolean | null
  delivery?: 'none' | 'own' | 'grab' | 'foodpanda' | 'other' | null
  delivery_note?: string
  preorders?: boolean | null
  preorder_lead_time?: string
  payment_methods?: ('cash' | 'paynow' | 'card' | 'grabpay' | 'nets' | 'other')[]
  busy_hours?: string
}
export interface Business {
  id: string
  fields: {
    name: string
    category: string
    location: string
    lat?: number | null
    lng?: number | null
    place_id?: string | null
    pin_label?: string | null
    pin_demo?: boolean
    timezone?: string
    hours: string
    phone: string
    /** ISO 4217; shops saved before currencies existed have none (treated as SGD). */
    currency?: string
  } & ShopFacts
  revision: number
  registration: string
  public: boolean
  google_publication: string
}
export interface Product {
  id?: string
  name: string
  price: number
  unit: string
  stock: number | null
  available?: boolean
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
export interface Me {
  legal_version: string
  consent: { version: string; accepted: number } | null
  consent_current: boolean
}
export interface Conversation {
  session_id: string
  business_id?: string | null
  updated: number
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
export type Api = <T>(path: string, init?: RequestInit & { raw?: boolean }) => Promise<T>
export function makeApi(getToken: () => Promise<string | null>): Api {
  return async <T>(path: string, init: RequestInit & { raw?: boolean } = {}) => {
    const { raw, ...requestInit } = init
    const token = await getToken()
    const response = await fetch('/api/v1' + path, {
      ...requestInit,
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
    if (raw) return response as T
    return response.json() as Promise<T>
  }
}
