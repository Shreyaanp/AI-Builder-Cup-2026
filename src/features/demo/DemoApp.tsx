import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  Alert,
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
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
import { currentPath, subscribePath, customerNavigate } from '../frontdoors/navigation'

type Session = { session_id: string; expires_at: number }
type DemoShop = { id: string; name: string }
const PublicShop = lazy(() => import('../public/PublicShop'))
const demoIdentity = {
  mode: 'local' as const,
  status: 'ready' as const,
  scope: 'demo',
  error: '',
  features: hiddenFeatures,
  getToken: async () => null,
  signIn: async () => undefined,
  signOut: async () => undefined,
}
const demoMe = { legal_version: '', consent: null, consent_current: true }

export default function DemoApp() {
  const t = useDemoCopy()
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
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      void fetch(`/api/v1/demo/workspace?public=true&zone=${encodeURIComponent(zone)}`, {
        method: 'POST',
        credentials: 'omit',
        signal: abort.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('demo')
          const value = (await response.json()) as Session
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
            setSession(null)
            setState('expired')
          })
        }
        if (!response.ok) throw new ApiError(t.readOnly, response.status, 'DEMO_NOT_SENT')
        return (await response.json()) as T
      },
    [session, t.expired, t.readOnly],
  )
  // The owner app on the visitor's own sandbox: reads and safe writes run there and reset
  // with it; anything that would leave the demo (a message, push, payment) is not sent.
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
    setCoachEndpoint(`/api/v1/demo/sessions/${session.session_id}/coach`)
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
  const exit = useCallback(async () => {
    try {
      if (session)
        await fetch(`/api/v1/demo/sessions/${session.session_id}`, {
          method: 'DELETE',
          credentials: 'omit',
          signal: AbortSignal.timeout(5000),
        })
    } catch {
      // An unreachable server must not trap the visitor; the fixture also expires on its own.
    } finally {
      location.assign(customer ? '/explore/' : '/')
    }
  }, [session, customer])
  return (
    <IdentityContext value={demoIdentity}>
      <Box
        sx={{
          minHeight: '100dvh',
          pb: 'env(safe-area-inset-bottom)',
          '--app-viewport': 'calc(100dvh - 48px - env(safe-area-inset-top))',
        }}
      >
        <Box
          component="header"
          sx={{
            px: 2,
            pt: 'env(safe-area-inset-top)',
            bgcolor: (theme) => theme.material.secondaryContainer,
            color: (theme) => theme.material.onSecondaryContainer,
          }}
        >
          {/* One slim line: what this is, the other side, and the way out. */}
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minHeight: 48 }}>
            <Typography variant="bodySmall" noWrap sx={{ flex: 1, minWidth: 0 }}>
              {t.banner}
            </Typography>
            <Button
              size="small"
              href={customer ? '/demo' : '/explore/demo'}
              onClick={customerNavigate}
              sx={{ minHeight: 48, minWidth: 0, px: 1, flexShrink: 0 }}
            >
              {customer ? t.owner : t.customer}
            </Button>
            <Button
              size="small"
              onClick={() => void exit()}
              sx={{ minHeight: 48, minWidth: 0, px: 1, flexShrink: 0 }}
            >
              {t.exit}
            </Button>
          </Stack>
          {customer && !shop && (
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
              <LanguagePicker variant="inline" />
              <AppearanceToggle inline />
            </Stack>
          )}
        </Box>
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
            <Box component="main" sx={{ maxWidth: 760, mx: 'auto', p: 2 }}>
              <Typography component="h1" variant="headlineSmall">
                {t.customer}
              </Typography>
              <List>
                {shops.map((item) => (
                  <ListItemButton
                    key={item.id}
                    component="a"
                    href={`/explore/demo/${item.id}`}
                    onClick={customerNavigate}
                    sx={{ minHeight: 64 }}
                  >
                    <ListItemText primary={item.name} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          )
        ) : (
          <BackHistory value>
            <WorkspaceProvider api={ownerApi} me={demoMe} readOnlyMessage={t.demoNotice}>
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
