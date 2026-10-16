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
  kind: 'duplicate_owner' | 'listing'
  status: 'open' | 'cleared' | 'upheld' | 'resolved'
  updated?: number
  similarity?: number
  /** Duplicate: shop names of the newer and the earlier account. */
  shops?: string[][]
  shop?: string
  business_id?: string
  reasons?: { rule: string; detail: string; source: string }[]
}

export interface Trust {
  face: FaceStatus
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
