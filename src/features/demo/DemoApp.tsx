import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Alert, Box, Button, Skeleton, Snackbar, Stack } from '@mui/material'
import { IdentityContext } from '../../auth/context'
import { hiddenFeatures } from '../../auth/features'
import { useDemoCopy } from '../frontdoors/strings'
import { AppearanceToggle } from '../frontdoors/AppearanceToggle'
import { LanguagePicker } from '../frontdoors/LanguagePicker'
import { WorkspaceProvider } from '../v1/WorkspaceProvider'
import { AppShell } from '../v1/AppShell'
import { BackHistory } from '../v1/backStack'
import { ApiError, type Api } from '../v1/api'
import { setCoachEndpoint } from '../../api/stream'
import { DemoWelcome } from './DemoWelcome'
import { DemoBrowse } from '../customer/DemoBrowse'
import { currentPath, subscribePath, customerNavigate } from '../frontdoors/navigation'
import { DemoBanner } from './DemoBanner'
import {
  exitDemo,
  forgetSession,
  rememberSession,
  savedSession,
  setCustomerTour,
  type Session,
} from './demoSession'

type DemoShop = { id: string; name: string }
const PublicShop = lazy(() => import('../public/PublicShop'))
const demoIdentity = {
  mode: 'local' as const,
  status: 'ready' as const,
  scope: 'demo',
  error: '',
  // Get on Google opens the practice simulator here: nothing reaches Google.
  features: { ...hiddenFeatures, google_guide: true },
  getToken: async () => null,
  signIn: async () => undefined,
  signOut: async () => undefined,
}
const demoMe = { legal_version: '', consent: null, consent_current: true }

export default function DemoApp() {
  const t = useDemoCopy()
  const bannerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const banner = bannerRef.current
    if (!banner) return
    // The notice can wrap with translations or larger text; reserve its actual height.
    const measure = () =>
      banner.parentElement?.style.setProperty(
        '--app-viewport',
        `calc(100dvh - ${banner.getBoundingClientRect().height}px)`,
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(banner)
    return () => observer.disconnect()
  }, [])
  const [session, setSession] = useState<Session | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'expired'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [shops, setShops] = useState<DemoShop[]>([])
  const path = useSyncExternalStore(subscribePath, currentPath)
  const customer = path.startsWith('/explore/demo')
  const shop = /^\/explore\/demo\/(demo-[a-z0-9-]+)\/?$/.exec(path)?.[1]
  useEffect(() => {
    document.title = t.title
  }, [t.title])
  useEffect(() => {
    // Strict Mode's first effect is cancelled before allocating a workspace.
    const abort = new AbortController()
    const start = window.setTimeout(() => {
      // Moving around the demo (owner, Browse shops, a reload) keeps this tab's sandbox, so a
      // visitor never spends the per-network allocation limit just by clicking.
      const saved = savedSession()
      if (saved) {
        setSession(saved)
        setState('ready')
        return
      }
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      void fetch(`/api/v1/demo/workspace?public=true&zone=${encodeURIComponent(zone)}`, {
        method: 'POST',
        credentials: 'omit',
        signal: abort.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('demo')
          const value = (await response.json()) as Session
          rememberSession(value)
          if (!abort.signal.aborted) {
            setSession(value)
            setState('ready')
          }
        })
        .catch(() => {
          if (!abort.signal.aborted) setState('failed')
        })
    }, 0)
    return () => {
      clearTimeout(start)
      abort.abort()
    }
  }, [attempt])
  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(
      () => {
        forgetSession(session?.session_id)
        setSession(null)
        setState('expired')
      },
      Math.max(0, session.expires_at * 1000 - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [session])
  const [note, setNote] = useState(false)
  // Customer-side snapshot reads.
  const api = useMemo<Api>(
    () =>
      async <T,>(path: string, init: RequestInit & { raw?: boolean } = {}) => {
        if (!session) throw new ApiError(t.expired, 410, 'DEMO_EXPIRED')
        if ((init.method ?? 'GET') !== 'GET') throw new ApiError(t.readOnly, 403, 'DEMO_NOT_SENT')
        const response = await fetch(
          `/api/v1/demo/sessions/${session.session_id}?path=${encodeURIComponent(path.split('?')[0]!)}`,
          {
            credentials: 'omit',
            signal: init.signal,
          },
        )
        if (response.status === 410) {
          queueMicrotask(() => {
            forgetSession(session?.session_id)
            setSession(null)
            setState('expired')
          })
        }
        if (!response.ok) throw new ApiError(t.readOnly, response.status, 'DEMO_NOT_SENT')
        return (await response.json()) as T
      },
    [session, t.expired, t.readOnly],
  )
  // The owner app on the visitor's own sandbox: every feature runs there and resets with it.
  // Only what would touch the real world answers DEMO_NOT_SENT, with a plain "pretend" note.
  const ownerApi = useMemo<Api>(
    () =>
      async <T,>(path: string, init: RequestInit & { raw?: boolean } = {}) => {
        if (!session) throw new ApiError(t.expired, 410, 'DEMO_EXPIRED')
        const { raw, ...requestInit } = init
        const response = await fetch(`/api/v1/demo/sessions/${session.session_id}/api${path}`, {
          ...requestInit,
          credentials: 'omit',
          signal: init.signal ?? AbortSignal.timeout(25_000),
          headers: {
            ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers,
          },
        })
        if (response.status === 410) {
          queueMicrotask(() => {
            forgetSession(session?.session_id)
            setSession(null)
            setState('expired')
          })
        }
        if (!response.ok) {
          const detail = await response
            .json()
            .then((body: { detail?: unknown }) =>
              typeof body.detail === 'string' ? body.detail : '',
            )
            .catch(() => '')
          if (detail === 'DEMO_NOT_SENT') setNote(true)
          throw new ApiError(t.readOnly, response.status, detail)
        }
        if (raw) return response as T
        return (await response.json()) as T
      },
    [session, t.expired, t.readOnly],
  )
  useEffect(() => {
    if (!session || customer) return
    const sessionId = session.session_id
    setCoachEndpoint(`/api/v1/demo/sessions/${sessionId}/coach`, () => {
      forgetSession(sessionId)
      setSession(null)
      setState('expired')
    })
    return () => setCoachEndpoint(null)
  }, [session, customer])
  useEffect(() => {
    if (!session || !customer) return
    const abort = new AbortController()
    void api<DemoShop[]>('/shops', { signal: abort.signal })
      .then(setShops)
      .catch(() => undefined)
    return () => abort.abort()
  }, [session, customer, api])
  // The customer demo's steps open the real shop page and Passport: while this side is open they
  // carry the demo banner too (CustomerApp reads this).
  useEffect(() => setCustomerTour(customer), [customer])
  const exit = useCallback(
    () => exitDemo(session, customer ? '/explore/' : '/'),
    [session, customer],
  )
  return (
    <IdentityContext value={demoIdentity}>
      <Box
        sx={{
          minHeight: '100dvh',
          pb: 'env(safe-area-inset-bottom)',
          '--app-viewport': 'calc(100dvh - 48px - env(safe-area-inset-top))',
        }}
      >
        <DemoBanner
          ref={bannerRef}
          customer={customer}
          onSwitch={customerNavigate}
          onExit={() => void exit()}
        />
        {state === 'loading' ? (
          <Stack spacing={2} sx={{ p: 2 }} aria-busy="true">
            <Skeleton height={80} />
            <Skeleton variant="rounded" height={220} />
          </Stack>
        ) : state !== 'ready' ? (
          <Stack spacing={2} sx={{ p: 3, maxWidth: 480, mx: 'auto' }}>
            <Alert severity="info">{state === 'expired' ? t.expired : t.failed}</Alert>
            <Button
              variant="contained"
              onClick={() => {
                setState('loading')
                setAttempt((n) => n + 1)
              }}
            >
              {t.retry}
            </Button>
          </Stack>
        ) : customer ? (
          shop ? (
            <Suspense fallback={<Skeleton variant="rounded" height={220} />}>
              <PublicShop id={shop} previewApi={api} />
            </Suspense>
          ) : (
            <DemoBrowse
              shops={shops}
              api={api}
              actions={
                <>
                  <LanguagePicker variant="inline" />
                  <AppearanceToggle inline />
                </>
              }
            />
          )
        ) : (
          <BackHistory value>
            <WorkspaceProvider
              api={ownerApi}
              me={demoMe}
              readOnlyMessage={t.demoNotice}
              onStartOwnShop={exit}
            >
              <AppShell />
              <DemoWelcome />
            </WorkspaceProvider>
          </BackHistory>
        )}
        <Snackbar
          open={note}
          message={t.readOnly}
          autoHideDuration={3000}
          onClose={() => setNote(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        />
      </Box>
    </IdentityContext>
  )
}
