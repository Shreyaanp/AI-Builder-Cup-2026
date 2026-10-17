import { clientTimezoneHeader } from '../../api/timezone'
/** Optional facts customers ask about; absent until the owner confirms them. */
export interface ShopFacts {
  halal?: 'yes' | 'no' | 'muslim_owned' | 'not_stated' | null
  vegetarian_options?: boolean | null
  locally_made?: boolean | null
  delivery?: string | null
  delivery_note?: string
  preorders?: boolean | null
  preorder_lead_time?: string
  payment_methods?: string[]
  busy_hours?: string
  /** Answers to the business-type question plan, in the owner's words. */
  custom_facts?: { key: string; label: string; value: string }[]
}
export interface Business {
  id: string
  last_confirmed?: string | null
  fields: {
    name: string
    category: string
    location: string
    lat?: number | null
    lng?: number | null
    place_id?: string | null
    pin_label?: string | null
    pin_demo?: boolean
    pin_source?: 'device' | 'pin' | null
    pin_accuracy_m?: number | null
    description?: string
    timezone?: string
    hours: string
    weekly_hours?: import('../shop/hoursModel').DayHours[]
    /** Shop-local date the owner closed the shop for ("closed today"). */
    closed_on?: string
    phone: string
    reward_text?: string
    stamps_needed?: number
    upi_id?: string
    rider_providers?: ('rapido' | 'uber' | 'porter')[]
    /** ISO 4217; shops saved before currencies existed have none (treated as SGD). */
    currency?: string
  } & ShopFacts
  revision: number
  /** Private notes the coach keeps for this shop (owner can delete them). */
  coach_notes?: { id: string; text: string; created: string }[]
  /** Photo IDs the owner chose to show customers (public once the page is shared). */
  gallery?: string[]
  /** ID of the shop's icon picture; the app draws a monogram when there is none. */
  icon?: string | null
  registration: string
  public: boolean
  google_publication: string
}
export interface Product {
  id?: string
  name: string
  category?: string
  price: number
  unit: string
  stock: number | null
  available?: boolean
}
export interface Proposal {
  /** Client-only guided completion marker, outside the sealed snapshot. */
  new_shop?: boolean
  import_flags?: { row: number; item: string; reasons: string[] }[]
  /** Client-only: what the photo reader was unsure of (or that it was a fixture), shown in review. */
  photo_notes?: string[]
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
  /** Steps of an earlier "Delete all my data" still being retried (backend erasure.STEPS). */
  erase_pending?: string[]
}
export interface EraseResult {
  status: 'erased' | 'partial'
  erased: string[]
  pending: string[]
}
export interface Conversation {
  session_id: string
  business_id?: string | null
  new_shop?: boolean
  updated: number
}
export interface PhotoResult {
  status: 'needs_review' | 'nothing_to_propose'
  photo_kind: string
  extraction: {
    uncertain: string[]
    business?: { name: string; category: string; location: string; hours: string; phone: string }
    products?: { name: string; price: number | null; unit: string; category?: string }[]
  }
  proposal: Proposal | null
  pin_proposal?: Proposal | null
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
        ...clientTimezoneHeader(),
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
