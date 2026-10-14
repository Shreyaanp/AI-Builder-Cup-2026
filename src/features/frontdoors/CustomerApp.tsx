import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Alert, Box, Button, Chip, LinearProgress, Stack, Typography } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { discoverCopy } from '../discover/strings'
import { PlaceSearch } from '../discover/PlaceSearch'
import type { FoundPlace } from '../discover/PlaceSearch'
import { useFrontCopy } from './strings'
import { BrandSplash } from './Splash'
import { currentPath, customerNavigate, subscribePath } from './navigation'
import './frontdoors.css'

const Discover = lazy(() => import('../discover/Discover'))
const PublicShop = lazy(() => import('../public/PublicShop'))
const journeyKey = 'chalkboard.customer.journey'
const categories = ['kopi', 'hawker', 'bakery', 'cafe', 'grocery', 'catering'] as const
export type CustomerLocation = { gps: [number, number] | null; place: FoundPlace | null }
function firstRun() {
  try {
    return localStorage.getItem(journeyKey) !== 'done'
  } catch {
    return true
  }
}

export default function CustomerApp() {
  const path = useSyncExternalStore(subscribePath, currentPath)
  const [setup, setSetup] = useState(firstRun)
  const [locationChoice, setLocationChoice] = useState<CustomerLocation | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [coachmark, setCoachmark] = useState(false)
  const t = useFrontCopy()
  const id = /^\/explore\/s\/([0-9a-f-]{36})\/?$/i.exec(path)?.[1]
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
  if (!id && setup)
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
  return (
    <>
      <a href="#customer-content" className="skip-link">
        {t.skip}
      </a>
      {id && (
        <Box
          component="nav"
          sx={{ maxWidth: 1000, mx: 'auto', px: 4, pt: 'max(16px, env(safe-area-inset-top))' }}
        >
          <Button component="a" href="/explore/" onClick={customerNavigate}>
            {t.back} · <span translate="no">Chalkboard</span>
          </Button>
        </Box>
      )}
      {coachmark && !id && (
        <Box sx={{ maxWidth: 1100, mx: 'auto', px: 4, pt: 4 }}>
          <Alert action={<Button onClick={() => setCoachmark(false)}>{t.gotIt}</Button>}>
            {t.coachmark}
          </Alert>
        </Box>
      )}
      <div id="customer-content" tabIndex={-1}>
        <Suspense fallback={<BrandSplash />}>
          {id ? (
            <PublicShop key={id} id={id} />
          ) : (
            <Discover initialLocation={locationChoice} interests={interests} />
          )}
        </Suspense>
      </div>
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
      { timeout: 8000, maximumAge: 60000, enableHighAccuracy: false },
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
