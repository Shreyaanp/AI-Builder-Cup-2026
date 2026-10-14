import { useCallback, useEffect, useMemo, useState } from 'react'
import { useIdentity } from '../../auth/useIdentity'
import { makeApi } from './api'
import type { Me } from './api'
import { AppShell } from './AppShell'
import { LEGAL_VERSION } from './legal'
import { AccountError, ConsentScreen, Splash, Welcome } from './Onboarding'
import { WorkspaceProvider } from './WorkspaceProvider'

/** First run: splash → welcome/sign-in → consent → workspace. */
export default function V1App() {
  const identity = useIdentity()
  const [preview, setPreview] = useState(false)
  if (identity.status === 'loading') return <Splash />
  if (identity.status !== 'ready' || (identity.mode === 'local' && !preview))
    return <Welcome onPreview={() => setPreview(true)} />
  return <Account key={identity.scope} onLeave={() => setPreview(false)} />
}

function Account({ onLeave }: { onLeave: () => void }) {
  const identity = useIdentity()
  const api = useMemo(() => makeApi(identity.getToken), [identity.getToken])
  const [me, setMe] = useState<Me | null>(null)
  const [failed, setFailed] = useState(false)
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
  if (failed)
    return <AccountError onSignOut={identity.mode === 'firebase' ? identity.signOut : onLeave} />
  if (!me) return <Splash />
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
    <WorkspaceProvider api={api} me={me}>
      <AppShell />
    </WorkspaceProvider>
  )
}
