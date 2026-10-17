import { useCallback, useEffect, useState } from 'react'
import type { Api } from '../v1/api'

export type FaceStatus = 'not_started' | 'verified' | 'in_review' | 'not_verified'

export interface Notice {
  id: string
  kind: 'duplicate_owner' | 'listing'
  business_id?: string
  shop?: string
  reasons?: { rule: string; detail: string }[]
}

export interface Review {
  id: string
  kind: 'duplicate_owner' | 'liveness' | 'listing'
  status: 'open' | 'cleared' | 'upheld' | 'resolved'
  updated?: number
  similarity?: number
  /** Liveness: the anti-spoof model's real-person score the reviewer is deciding on. */
  score?: number
  /** Duplicate: shop names of the newer and the earlier account; liveness: the owner's. */
  shops?: string[][]
  shop?: string
  business_id?: string
  /** `detail` is English; `other` and `owner_detail` fill a sentence in the reviewer's language. */
  reasons?: {
    rule: string
    detail: string
    source: string
    other?: string
    owner_detail?: string
  }[]
}

export interface Trust {
  face: FaceStatus
  /** Why a check is in review: another account's face, or a live check the model was unsure of. */
  review?: 'duplicate' | 'liveness'
  checked?: number | null
  notices: Notice[]
  reviewer: boolean
  queue?: Review[]
}

/** Any screen that changes the trust status announces it, so every card refreshes. */
export const TRUST_CHANGED = 'chalkboard:trust-changed'
export function announceTrustChange() {
  window.dispatchEvent(new Event(TRUST_CHANGED))
}

export function useTrust(api: Api) {
  const [trust, setTrust] = useState<Trust | null>(null)
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((value) => value + 1), [])
  useEffect(() => {
    const abort = new AbortController()
    api<Trust>('/trust', { signal: abort.signal })
      .then((next) => {
        if (abort.signal.aborted) return
        setTrust(next)
        setFailed(false)
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true)
      })
    return () => abort.abort()
  }, [api, version])
  useEffect(() => {
    window.addEventListener(TRUST_CHANGED, reload)
    return () => window.removeEventListener(TRUST_CHANGED, reload)
  }, [reload])
  return { trust, failed, reload }
}
