import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CssBaseline,
  LinearProgress,
  Stack,
  ThemeProvider,
  Typography,
  useTheme,
} from '@mui/material'
import { customerTheme } from '../../design/customerTheme'
import { AppearanceToggle } from './AppearanceToggle'
import { useLocale } from '../../state/hooks'
import { discoverCopy } from '../discover/strings'
import { categories } from '../discover/categories'
import { PlaceSearch } from '../discover/PlaceSearch'
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
const journeyKey = 'chalkboard.customer.journey'
export type CustomerLocation = { gps: [number, number] | null; place: FoundPlace | null }
function firstRun() {
  try {
    return localStorage.getItem(journeyKey) !== 'done'
  } catch {
    return true
  }
}

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
          <AppearanceToggle />
          <CustomerPages />
        </Box>
      </CustomerAccountProvider>
    </ThemeProvider>
  )
}

function CustomerPages() {
  const path = useSyncExternalStore(subscribePath, currentPath)
  const [setup, setSetup] = useState(firstRun)
  const [locationChoice, setLocationChoice] = useState<CustomerLocation | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [coachmark, setCoachmark] = useState(false)
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
  if (!id && !thread && !chats && !saved && !passport && !rescue && setup)
    return (
      <CustomerWelcome
        onComplete={(value, picks) => {
          setLocationChoice(value)
          setInterests(picks)
          setSetup(false)
          setCoachmark(true)
          try {
            localStorage.setItem(journeyKey, 'done')
          } catch {
            /* Optional UI progress only. */
          }
        }}
      />
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
      {coachmark && browse && (
        <Box sx={{ maxWidth: 1100, mx: 'auto', px: 4, pt: 4 }}>
          <Alert action={<Button onClick={() => setCoachmark(false)}>{t.gotIt}</Button>}>
            {t.coachmark}
          </Alert>
        </Box>
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
            <Passport />
          ) : rescue ? (
            <RescueScreen />
          ) : browse ? (
            <Discover initialLocation={locationChoice} interests={interests} />
          ) : (
            // AI-first front door (user decision, Oct 15); the full list is one tap away.
            <AskHome initialLocation={locationChoice} />
          )}
        </Suspense>
      </div>
      {tab && (
        <>
          <ProfileButton />
          <CustomerNav active={tab} />
        </>
      )}
    </>
  )
}

function CustomerWelcome({
  onComplete,
}: {
  onComplete: (location: CustomerLocation, interests: string[]) => void
}) {
  const locale = useLocale()
  const d = discoverCopy(locale)
  const t = useFrontCopy()
  const [step, setStep] = useState(1)
  const [place, setPlace] = useState<FoundPlace | null>(null)
  const [gps, setGps] = useState<[number, number] | null>(null)
  const [picks, setPicks] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [step])
  useEffect(() => {
    document.title = `${step === 1 ? t.location : t.interests} · Chalkboard`
  }, [step, t.location, t.interests])
  function locate() {
    setBusy(true)
    setDenied(false)
    if (!navigator.geolocation) {
      setBusy(false)
      setDenied(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps([position.coords.latitude, position.coords.longitude])
        setBusy(false)
        setStep(2)
      },
      () => {
        setBusy(false)
        setDenied(true)
      },
      // Precise: "around me" should mean this street, not this district.
      { timeout: 15_000, maximumAge: 30_000, enableHighAccuracy: true },
    )
  }
  const progress = t.step.replace('{step}', String(step)).replace('{total}', '2')
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        maxWidth: 520,
        mx: 'auto',
        p: 6,
        pt: 'max(48px, env(safe-area-inset-top))',
        pb: 'max(32px, env(safe-area-inset-bottom))',
      }}
    >
      <Stack spacing={6}>
        <Typography variant="titleLarge" translate="no">
          Chalkboard
        </Typography>
        <Box>
          <Typography variant="labelLarge">{progress}</Typography>
          <LinearProgress
            variant="determinate"
            value={step * 50}
            aria-label={progress}
            sx={{ mt: 3 }}
          />
        </Box>
        <Typography component="h1" variant="headlineLarge" tabIndex={-1} ref={heading}>
          {step === 1 ? t.location : t.interests}
        </Typography>
        <Typography variant="bodyLarge">{step === 1 ? t.locationBody : t.interestsBody}</Typography>
        {step === 1 ? (
          <>
            {denied && <Alert severity="info">{d.gpsError}</Alert>}
            <Button variant="contained" disabled={busy} onClick={locate}>
              {d.gps}
            </Button>
            <PlaceSearch
              value={place?.label}
              onFound={(found) => {
                setPlace(found)
                setGps(null)
                setDenied(false)
                setStep(2)
              }}
            />
            <Button variant="text" disabled={busy} onClick={() => setStep(2)}>
              {t.continue}
            </Button>
          </>
        ) : (
          <>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 3 }}>
              {categories.map((category) => (
                <Chip
                  key={category}
                  label={d[category]}
                  clickable
                  aria-pressed={picks.includes(category)}
                  color={picks.includes(category) ? 'primary' : 'default'}
                  sx={{ minHeight: 48 }}
                  onClick={() =>
                    setPicks((values) =>
                      values.includes(category)
                        ? values.filter((v) => v !== category)
                        : [...values, category],
                    )
                  }
                />
              ))}
            </Stack>
            <Button
              variant="contained"
              onClick={() =>
                onComplete(
                  { gps, place },
                  picks.map((pick) => (pick === 'cafe' ? 'café' : pick)),
                )
              }
            >
              {t.feed}
            </Button>
            <Button onClick={() => setStep(1)}>{t.back}</Button>
          </>
        )}
      </Stack>
    </Box>
  )
}
