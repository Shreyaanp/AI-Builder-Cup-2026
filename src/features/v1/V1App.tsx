import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useIdentity } from '../../auth/useIdentity'
import { deferred } from '../../app/deferred'
import { makeApi } from './api'
import type { Business, Me } from './api'
import { LEGAL_VERSION } from './legal'
import { Landing } from './Landing'
import { AccountError, ConsentScreen, Splash } from './Onboarding'
import { Box } from '@mui/material'
import { TrustStrip } from './TrustStrip'

import { LanguageStep } from '../language/LanguageStep'
import { useNeedsLanguage } from '../language/needsLanguage'
import { setAnalyticsConsent } from '../../app/analytics'

// OB-78/OB-165: the welcome and sign-in no longer wait for the whole owner app. Its code is
// fetched as soon as an account is known, beside /me, so the workspace itself is not later.
const OwnerWorkspace = deferred(() => import('./OwnerWorkspace').then((m) => m.default))

/** First run: splash → welcome/sign-in → language → consent → workspace. */
export default function V1App() {
  const identity = useIdentity()
  const [preview, setPreview] = useState(false)
  useEffect(() => {
    if (identity.status !== 'ready' || (identity.mode === 'local' && !preview))
      setAnalyticsConsent(false)
  }, [identity.status, identity.mode, preview])
  if (identity.status === 'loading') return <Splash />
  if (identity.status !== 'ready' || (identity.mode === 'local' && !preview))
    return (
      <>
        {identity.trustStrip?.enabled && (
          <Box
            sx={{ maxWidth: 1080, mx: 'auto', px: 3, pt: 'calc(16px + env(safe-area-inset-top))' }}
          >
            <TrustStrip />
          </Box>
        )}
        <Landing onPreview={() => setPreview(true)} />
      </>
    )
  return <Account key={identity.scope} onLeave={() => setPreview(false)} />
}

function Account({ onLeave }: { onLeave: () => void }) {
  const identity = useIdentity()
  const api = useMemo(() => makeApi(identity.getToken), [identity.getToken])
  const [me, setMe] = useState<Me | null>(null)
  const [failed, setFailed] = useState(false)
  const needsLanguage = useNeedsLanguage()
  useEffect(() => {
    void OwnerWorkspace.preload().catch(() => {})
  }, [])
  // The language step guesses from the owner's shop pin when they already have a shop.
  const [shops, setShops] = useState<Business[] | null>(null)
  useEffect(() => {
    if (!needsLanguage || !me) return
    const abort = new AbortController()
    void api<Business[]>('/businesses', { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setShops(value)
      })
      .catch(() => {
        if (!abort.signal.aborted) setShops([])
      })
    return () => abort.abort()
  }, [api, me, needsLanguage])
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const value = await api<Me>('/me', { signal })
      if (!signal?.aborted) setMe(value)
    },
    [api],
  )
  useEffect(() => {
    const abort = new AbortController()
    void api<Me>('/me', { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setMe(value)
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true)
      })
    return () => abort.abort()
  }, [api])
  useEffect(() => {
    setAnalyticsConsent(me?.consent_current === true)
  }, [me?.consent_current])
  if (failed)
    return <AccountError onSignOut={identity.mode === 'firebase' ? identity.signOut : onLeave} />
  if (!me) return <Splash />
  if (needsLanguage)
    return shops ? <LanguageStep shop place={shops[0]?.fields ?? null} /> : <Splash />
  if (!me.consent_current)
    return (
      <ConsentScreen
        onAccept={async () => {
          await api('/consent', {
            method: 'POST',
            body: JSON.stringify({ version: LEGAL_VERSION, terms: true, privacy: true }),
          })
          await load()
        }}
        onDecline={() => {
          if (identity.mode === 'firebase') void identity.signOut()
          else onLeave()
        }}
      />
    )
  return (
    <Suspense fallback={<Splash />}>
      <OwnerWorkspace api={api} me={me} />
    </Suspense>
  )
}
