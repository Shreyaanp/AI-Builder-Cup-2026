import { Component, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import {
  Box,
  Button,
  CssBaseline,
  Dialog,
  Stack,
  ThemeProvider,
  Typography,
  useTheme,
} from '@mui/material'
import { CloudOff, RotateCw } from 'lucide-react'
import { customerTheme } from '../../design/customerTheme'
import type { FoundPlace } from '../discover/PlaceSearch'
import { useFrontCopy } from './strings'
import { BrandSplash } from './Splash'
import { currentPath, subscribePath } from './navigation'
import './frontdoors.css'
import { CustomerAccountProvider, useCustomer } from '../customer/account'
import { LanguageStep } from '../language/LanguageStep'
import { useNeedsLanguage } from '../language/needsLanguage'
import { CustomerNav } from '../customer/CustomerNav'
import type { CustomerTab } from '../customer/CustomerNav'
import { BackHistory, overlayHandled } from '../v1/backStack'
import { lastDirection, restoreScroll } from '../../app/history'
import { CustomerTopBar } from '../customer/TopBar'
import { FirstRun } from '../first-run/FirstRun'
import { Farewell } from '../../auth/Farewell'
import { track } from '../../app/analytics'
import { retryableLazy, retryFailedScreens } from '../../app/retryLazy'
import { useOfflineCopy, useOnline, whenOnline } from '../customer/offline'

const Discover = retryableLazy(() => import('../discover/Discover'))
const AskHome = retryableLazy(() => import('../discover/AskHome'))
const PublicShop = retryableLazy(() => import('../public/PublicShop'))
const ChatList = retryableLazy(() =>
  import('../customer/Chats').then((m) => ({ default: m.ChatList })),
)
const ChatThread = retryableLazy(() =>
  import('../customer/Chats').then((m) => ({ default: m.ChatThread })),
)
const Saved = retryableLazy(() => import('../customer/Saved').then((m) => ({ default: m.Saved })))
const Passport = retryableLazy(() =>
  import('../passport/Passport').then((m) => ({ default: m.Passport })),
)
const RescueScreen = retryableLazy(() =>
  import('../rescue/RescueScreen').then((m) => ({ default: m.RescueScreen })),
)
export type CustomerLocation = { gps: [number, number] | null; place: FoundPlace | null }

/** A-18: a screen that could not open says so inside the app (top bar and nav stay), offline
 * or not, and opens by itself when the phone is back online. */
function ScreenProblem({ onRetry }: { onRetry: () => void }) {
  const online = useOnline()
  const t = useOfflineCopy()
  useEffect(() => whenOnline(onRetry), [onRetry])
  return (
    <Stack
      component="main"
      role="status"
      spacing={2}
      sx={{ maxWidth: 480, mx: 'auto', px: 4, pt: 10, pb: 16, textAlign: 'center' }}
    >
      <Box aria-hidden="true" sx={{ alignSelf: 'center', color: 'text.secondary' }}>
        <CloudOff size={32} />
      </Box>
      <Typography component="h1" variant="titleLarge">
        {online ? t.failedTitle : t.offlineTitle}
      </Typography>
      <Typography variant="bodyLarge" color="text.secondary">
        {online ? t.failedBody : t.offlineBody}
      </Typography>
      {online && (
        <Button
          variant="contained"
          startIcon={<RotateCw size={18} />}
          onClick={onRetry}
          sx={{ alignSelf: 'center', minHeight: 48 }}
        >
          {t.retry}
        </Button>
      )}
    </Stack>
  )
}

class ScreenBoundary extends Component<
  { children: ReactNode; path: string },
  { failed: boolean; path: string }
> {
  state = { failed: false, path: this.props.path }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: { path: string },
    state: { failed: boolean; path: string },
  ) {
    // Moving to another screen gives it a fresh start.
    return props.path === state.path ? null : { failed: false, path: props.path }
  }

  retry = () => {
    // The browser keeps a failed code download for the life of the page, so a screen whose
    // code did not arrive opens with a fresh page load; any other failure renders again.
    if (retryFailedScreens()) location.reload()
    else this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? <ScreenProblem onRetry={this.retry} /> : this.props.children
  }
}

export default function CustomerApp() {
  const mode = useTheme().palette.mode
  const theme = useMemo(() => customerTheme(mode), [mode])
  useEffect(() => track('customer_first_open'), [])
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previous = meta?.getAttribute('content')
    // The outer owner provider also updates this shared document element. Apply the
    // customer surface after its effects, including a system appearance change.
    const frame = requestAnimationFrame(() => meta?.setAttribute('content', theme.material.surface))
    return () => {
      cancelAnimationFrame(frame)
      if (previous) meta?.setAttribute('content', previous)
    }
  }, [theme])
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CustomerAccountProvider>
        {/* The phone's Back closes the customer's sheets and dialogs first, as in the owner app. */}
        <BackHistory value>
          <Box data-customer>
            <Farewell side="customer" />
            <FirstRun app="customer">
              <CustomerPages />
            </FirstRun>
          </Box>
        </BackHistory>
      </CustomerAccountProvider>
    </ThemeProvider>
  )
}

function CustomerPages() {
  const path = useSyncExternalStore(subscribePath, currentPath)
  const [locationChoice, setLocationChoice] = useState<CustomerLocation | null>(null)
  const t = useFrontCopy()
  const account = useCustomer()
  const needsLanguage = useNeedsLanguage()
  // Shop IDs are server UUIDs, or the fixed `demo-…` IDs of seeded demo shops.
  const id = /^\/explore\/s\/([0-9a-f-]{36}|demo-[a-z0-9-]{1,40})\/?$/i.exec(path)?.[1]
  // Chats tab, one thread (shop ID / thread UUID), and Saved.
  const thread =
    /^\/explore\/chats\/([0-9a-f-]{36}|demo-[a-z0-9-]{1,40})\/([0-9a-f-]{36})\/?$/i.exec(path)
  const chats = /^\/explore\/chats\/?$/.test(path)
  const saved = /^\/explore\/saved\/?$/.test(path)
  const passport = /^\/explore\/passport\/?$/.test(path)
  const rescue = /^\/explore\/rescue\/?$/.test(path)
  // The full list: its own path, or any shared list link with filters (?category=, ?area=…).
  const browse =
    /^\/explore\/browse\/?$/.test(path) ||
    ['q', 'category', 'area', 'open', 'halal', 'budget', 'view'].some((key) =>
      new URLSearchParams(location.search).has(key),
    )
  useEffect(() => {
    // A-18: the Passport and shop screens open offline, so fetch their code while online.
    const preload = () => {
      if (!navigator.onLine) return
      Passport.preload()
      PublicShop.preload()
    }
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(preload, { timeout: 4000 })
      : window.setTimeout(preload, 2500)
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
  }, [])
  useEffect(() => {
    // Back/Forward land where that page was; closing a sheet with Back leaves the page as it is.
    const restore = (event: PopStateEvent) => {
      if (!overlayHandled(event) && lastDirection() !== 0) restoreScroll()
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  // Right after sign-in: one tap to confirm the language guessed from the customer's area. Over
  // the page, so a message being written when they signed in carries on afterwards.
  const area = locationChoice?.gps
    ? { lat: locationChoice.gps[0], lng: locationChoice.gps[1] }
    : locationChoice?.place
  const languageStep = account.status === 'signed-in' && needsLanguage && (
    <Dialog fullScreen open aria-labelledby="language-step-title">
      <LanguageStep place={area ?? null} inDialog />
    </Dialog>
  )
  // Top-level destinations get the navigation bar; a shop or a thread is a full-screen detail.
  const tab: CustomerTab | null = chats
    ? 'chats'
    : saved
      ? 'saved'
      : passport
        ? 'passport'
        : rescue
          ? 'rescue'
          : !id && !thread && !browse
            ? 'ask'
            : null
  return (
    <>
      <a href="#customer-content" className="skip-link">
        {t.skip}
      </a>
      {/* The Ask front door, a shop and a chat thread carry these in their own header rows. */}
      {tab !== 'ask' && !id && !thread && <CustomerTopBar back={browse && !tab} />}
      <div id="customer-content" tabIndex={-1}>
        <ScreenBoundary path={path}>
          <Suspense fallback={<BrandSplash />}>
            {thread ? (
              <ChatThread key={thread[2]} shop={thread[1]!} thread={thread[2]!} />
            ) : id ? (
              <PublicShop key={id} id={id} />
            ) : chats ? (
              <ChatList />
            ) : saved ? (
              <Saved />
            ) : passport ? (
              <Passport initialLocation={locationChoice} />
            ) : rescue ? (
              <RescueScreen />
            ) : browse ? (
              <Discover initialLocation={locationChoice} onLocationChange={setLocationChoice} />
            ) : (
              // AI-first front door (user decision, Oct 15); the full list is one tap away. Where
              // to look is asked on the page itself, never as a setup wizard before it.
              <AskHome initialLocation={locationChoice} onLocationChange={setLocationChoice} />
            )}
          </Suspense>
        </ScreenBoundary>
      </div>
      {tab && <CustomerNav active={tab} />}
      {languageStep}
    </>
  )
}
