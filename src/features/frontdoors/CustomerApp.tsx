import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Box, CssBaseline, ThemeProvider, useTheme } from '@mui/material'
import { customerTheme } from '../../design/customerTheme'
import { AppearanceToggle } from './AppearanceToggle'
import { LanguagePicker } from './LanguagePicker'
import type { FoundPlace } from '../discover/PlaceSearch'
import { useFrontCopy } from './strings'
import { BrandSplash } from './Splash'
import { currentPath, subscribePath } from './navigation'
import './frontdoors.css'
import { CustomerAccountProvider } from '../customer/account'
import { CustomerNav } from '../customer/CustomerNav'
import type { CustomerTab } from '../customer/CustomerNav'
import { ProfileButton } from '../customer/Profile'

const Discover = lazy(() => import('../discover/Discover'))
const AskHome = lazy(() => import('../discover/AskHome'))
const PublicShop = lazy(() => import('../public/PublicShop'))
const ChatList = lazy(() => import('../customer/Chats').then((m) => ({ default: m.ChatList })))
const ChatThread = lazy(() => import('../customer/Chats').then((m) => ({ default: m.ChatThread })))
const Saved = lazy(() => import('../customer/Saved').then((m) => ({ default: m.Saved })))
const Passport = lazy(() => import('../passport/Passport').then((m) => ({ default: m.Passport })))
const RescueScreen = lazy(() =>
  import('../rescue/RescueScreen').then((m) => ({ default: m.RescueScreen })),
)
export type CustomerLocation = { gps: [number, number] | null; place: FoundPlace | null }

export default function CustomerApp() {
  const mode = useTheme().palette.mode
  const theme = useMemo(() => customerTheme(mode), [mode])
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
        <Box data-customer>
          <CustomerPages />
        </Box>
      </CustomerAccountProvider>
    </ThemeProvider>
  )
}

function CustomerPages() {
  const path = useSyncExternalStore(subscribePath, currentPath)
  const [locationChoice, setLocationChoice] = useState<CustomerLocation | null>(null)
  const t = useFrontCopy()
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
    const restore = () =>
      requestAnimationFrame(() =>
        window.scrollTo({
          top: (history.state as { scrollY?: number } | null)?.scrollY ?? 0,
          behavior: 'instant',
        }),
      )
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
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
      {/* The Ask front door carries these in its own header row; other pages float them. */}
      {tab !== 'ask' && (
        <>
          <LanguagePicker />
          <AppearanceToggle />
        </>
      )}
      <div id="customer-content" tabIndex={-1}>
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
      </div>
      {tab && (
        <>
          {tab !== 'ask' && <ProfileButton />}
          <CustomerNav active={tab} />
        </>
      )}
    </>
  )
}
