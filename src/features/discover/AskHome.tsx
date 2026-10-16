import { useEffect, useRef, useState } from 'react'
import {
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { ArrowRight, ArrowUp, MapPin, Mic, RotateCcw } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { customerNavigate } from '../frontdoors/navigation'
import { PlaceImage } from '../frontdoors/PlaceImage'
import type { CustomerLocation } from '../frontdoors/CustomerApp'
import { formatPrice } from '../v1/format'
import { askCopy } from './askStrings'
import { useCustomer } from '../customer/account'
import { accountCopyFor } from '../customer/copy'
import { FollowButton } from '../customer/FollowButton'
import { preferenceChips } from '../customer/preferences'
import { ProfileSheet } from '../customer/Profile'
import { PlaceSearch } from './PlaceSearch'
import { ensureDemoWorld } from './demoWorld'
import { locallyMadeLabel } from '../public/locallyMade'
import type { Locale } from '../../i18n/locales'
import type { FoundPlace } from './PlaceSearch'
import { TodayDeck } from '../passport/TodayDeck'
import { recsEvent } from '../recs/events'
import { dealIn, chalkWrite } from '../../design/chalkMotion'

type Item = { name: string; price: number; unit: string; available: boolean }
type Pick = {
  id: string
  name: string
  source: 'chalkboard' | 'google'
  locally_made?: boolean
  category: string
  distance_m: number
  open_now: boolean | null
  currency?: string | null
  photo_url?: string | null
  photo_authors?: string[]
  google_maps_uri?: string | null
  demo_shop?: boolean
  items: Item[]
  matched: Item[]
  /** Why it is "For you" (signed-in customers only). */
  reasons?: string[]
}
type Answer = {
  intent: { summary: string; followups: string[] }
  mode: 'ai' | 'keywords'
  groups: { id: 'for_you' | 'best' | 'open' | 'more'; places: Pick[] }[]
  personal?: { applied: string[]; saved: string[] } | null
}

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
const FILTERS = 'chalkboard.discover.filters'
const FALLBACK: FoundPlace = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }

function savedPlace(): FoundPlace | null {
  try {
    const place = (JSON.parse(localStorage.getItem(FILTERS) || '{}') as { place?: FoundPlace })
      .place
    return place && Number.isFinite(place.lat) && Number.isFinite(place.lng) ? place : null
  } catch {
    return null
  }
}

function rememberPlace(place: FoundPlace) {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS) || '{}') as object
    localStorage.setItem(FILTERS, JSON.stringify({ ...saved, place }))
  } catch {
    /* Optional storage. */
  }
}

const motion = {
  '@keyframes askDrift': {
    from: { transform: 'translate(-8%, -4%) scale(1)' },
    to: { transform: 'translate(8%, 6%) scale(1.15)' },
  },
  '@keyframes askPulse': {
    '0%, 100%': { transform: 'scale(1)', opacity: 0.7 },
    '50%': { transform: 'scale(1.3)', opacity: 1 },
  },
  '@keyframes askRise': {
    from: { opacity: 0, transform: 'translateY(18px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@keyframes askShimmer': {
    from: { backgroundPosition: '200% 0' },
    to: { backgroundPosition: '-200% 0' },
  },
  '@keyframes askLine': {
    '0%': { opacity: 0, transform: 'translateY(10px)' },
    '15%, 85%': { opacity: 1, transform: 'none' },
    '100%': { opacity: 0, transform: 'translateY(-10px)' },
  },
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    (new () => SpeechRecognitionLike) | null
}

/** The customer front door: say or type what you need; the AI curates nearby results. */
export default function AskHome({
  initialLocation,
  onLocationChange,
}: {
  initialLocation?: CustomerLocation | null
  onLocationChange?: (location: CustomerLocation) => void
}) {
  const locale = useLocale()
  const t = askCopy(locale)
  const accountCopy = accountCopyFor(locale)
  const roles = useTheme().material
  const [place, setPlace] = useState<FoundPlace>(
    () =>
      (initialLocation?.gps
        ? { lat: initialLocation.gps[0], lng: initialLocation.gps[1], label: t.here }
        : initialLocation?.place) ??
      savedPlace() ??
      FALLBACK,
  )
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'results'>('idle')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [failed, setFailed] = useState(false)
  const [changing, setChanging] = useState(false)
  const [listening, setListening] = useState(false)
  const [line, setLine] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const recognizer = useRef<SpeechRecognitionLike | null>(null)
  const Speech = speechRecognition()
  const account = useCustomer()
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    document.title = `${t.title} · Chalkboard`
  }, [t.title])

  useEffect(() => {
    if (phase !== 'thinking') return
    const timer = setInterval(() => setLine((n) => (n + 1) % t.thinking.length), 1100)
    return () => clearInterval(timer)
  }, [phase, t.thinking.length])

  async function ask(text: string, searchPlace = place) {
    const q = text.trim()
    if (!q || phase === 'thinking') return
    setQuery(q)
    setFailed(false)
    setLine(0)
    setPhase('thinking')
    const started = performance.now()
    try {
      await ensureDemoWorld(searchPlace.lat, searchPlace.lng, searchPlace.label)
      recsEvent({ kind: 'ask', query: q })
      // Signed-in customers get "For you" ranking and stated preferences remembered.
      const data = await account.api<Answer>('/api/v1/discover/ask', {
        method: 'POST',
        body: JSON.stringify({ q, lat: searchPlace.lat, lng: searchPlace.lng, language: locale }),
      })
      if (data.personal) {
        // Keep the profile sheet in step with what was just remembered.
        void account
          .api<{ profile?: unknown }>('/api/v1/customer/me')
          .then((me) => {
            if (me.profile)
              account.setProfile(me.profile as Parameters<typeof account.setProfile>[0])
          })
          .catch(() => undefined)
      }
      // Let the thinking motion read as a moment, not a flicker.
      const wait = Math.max(0, 1300 - (performance.now() - started))
      await new Promise((resolve) => setTimeout(resolve, wait))
      setAnswer(data)
      setPhase('results')
    } catch {
      setFailed(true)
      setPhase('idle')
    }
  }

  function listen() {
    if (!Speech) return
    if (listening) {
      recognizer.current?.stop()
      return
    }
    const recognition = new Speech()
    recognition.lang = locale
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('')
      setQuery(text)
    }
    recognition.onend = () => {
      setListening(false)
      setQuery((text) => {
        if (text.trim()) void ask(text)
        return text
      })
    }
    recognizer.current = recognition
    setListening(true)
    recognition.start()
  }

  const compact = phase !== 'idle'
  const total = answer?.groups.reduce((n, g) => n + g.places.length, 0) ?? 0

  return (
    <Box
      component="main"
      sx={{
        ...motion,
        position: 'relative',
        minHeight: '100dvh',
        overflowX: 'hidden',
        bgcolor: roles.surface,
        // Room for the navigation bar.
        pb: 'calc(112px + env(safe-area-inset-bottom))',
      }}
    >
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      {/* Ambient glow: drifts while idle, pulses while thinking. */}
      <Box
        aria-hidden="true"
        sx={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}
      >
        {[0, 1].map((n) => (
          <Box
            key={n}
            sx={{
              position: 'absolute',
              width: '70vmax',
              height: '70vmax',
              left: n ? '35%' : '-25%',
              top: n ? '-30%' : compact ? '-45%' : '10%',
              borderRadius: '50%',
              filter: 'blur(60px)',
              opacity: 1,
              background: `radial-gradient(circle, ${alpha(n ? roles.tertiary : roles.primary, 0.14)} 0%, transparent 62%)`,
              animation:
                phase === 'thinking'
                  ? `askPulse 1.6s ${EASE} infinite`
                  : `askDrift 4s ease-in-out both`,
            }}
          />
        ))}
      </Box>

      <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 720, mx: 'auto', px: 4 }}>
        <Box
          sx={{
            pt: compact ? 'max(72px, env(safe-area-inset-top))' : 'max(18vh, 72px)',
          }}
        >
          {!compact && (
            <Typography
              component="h1"
              variant="displaySmall"
              sx={{
                fontWeight: 500,
                letterSpacing: '-0.02em',
                ...chalkWrite,
              }}
            >
              {t.title}
            </Typography>
          )}

          <Box
            component="form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              void ask(query)
            }}
            sx={{
              mt: compact ? 0 : 5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              pl: 4,
              pr: 1,
              minHeight: 60,
              borderRadius: 999,
              bgcolor: roles.surfaceContainerHigh,
              boxShadow: listening ? `0 0 0 3px ${roles.primary}` : '0 6px 24px rgba(0,0,0,0.08)',
              transition: `box-shadow 300ms ${EASE}`,
              ...dealIn,
            }}
          >
            <InputBase
              inputRef={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={listening ? t.listening : t.placeholder}
              inputProps={{ 'aria-label': t.title, enterKeyHint: 'search', maxLength: 300 }}
              sx={{ flex: 1, minWidth: 0, fontSize: 18 }}
            />
            {Speech && (
              <IconButton
                aria-label={t.speak}
                aria-pressed={listening}
                onClick={listen}
                disabled={phase === 'thinking'}
                sx={{ color: listening ? roles.primary : undefined }}
              >
                <Mic size={22} />
              </IconButton>
            )}
            <IconButton
              type="submit"
              aria-label={t.ask}
              disabled={!query.trim() || phase === 'thinking'}
              sx={{
                bgcolor: roles.primary,
                color: roles.onPrimary,
                width: 44,
                height: 44,
                '&:hover': { bgcolor: roles.primary },
                '&.Mui-disabled': { bgcolor: roles.surfaceContainerHighest },
              }}
            >
              {phase === 'thinking' ? (
                <CircularProgress size={20} sx={{ color: roles.onPrimary }} />
              ) : (
                <ArrowUp size={20} />
              )}
            </IconButton>
          </Box>

          <Stack
            direction="row"
            sx={{
              mt: 2,
              alignItems: 'center',
              gap: 1,
              animation: `askRise 600ms ${EASE} 160ms both`,
            }}
          >
            <MapPin size={16} aria-hidden="true" />
            <Typography variant="bodyMedium" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {t.near.replace('{place}', place.label)}
            </Typography>
            <Button size="small" onClick={() => setChanging((open) => !open)}>
              {t.change}
            </Button>
          </Stack>
          {changing && (
            <Box sx={{ mt: 2, animation: `askRise 300ms ${EASE} both` }}>
              <PlaceSearch
                value={place.label}
                onFound={(found) => {
                  setPlace(found)
                  onLocationChange?.({ gps: null, place: found })
                  rememberPlace(found)
                  setChanging(false)
                  if (query.trim() && phase === 'results') void ask(query, found)
                }}
              />
            </Box>
          )}

          {phase === 'idle' && (
            <Stack direction="row" sx={{ mt: 4, gap: 1.5, flexWrap: 'wrap' }}>
              {t.suggestions.map((text, index) => (
                <Chip
                  key={text}
                  label={text}
                  clickable
                  onClick={() => void ask(text)}
                  sx={{
                    minHeight: 40,
                    bgcolor: roles.surfaceContainer,
                    ...dealIn,
                    '--deal-index': index,
                  }}
                />
              ))}
            </Stack>
          )}
          {failed && (
            <Typography role="alert" color="error" sx={{ mt: 3 }}>
              {t.failed}
            </Typography>
          )}
        </Box>

        {phase === 'thinking' && (
          <Box aria-live="polite" sx={{ mt: 8, height: 32, textAlign: 'center' }}>
            <Typography
              key={line}
              variant="titleMedium"
              color="text.secondary"
              sx={{ animation: `askLine 1100ms ${EASE} both` }}
            >
              {t.thinking[line]}
            </Typography>
            {/* Results forming: shimmering cards where the picks will land. */}
            <Box
              aria-hidden="true"
              sx={{
                mt: 5,
                display: 'grid',
                gridAutoFlow: 'column',
                gridAutoColumns: 'min(78vw, 280px)',
                gap: 3,
                overflow: 'hidden',
              }}
            >
              {[0, 1, 2].map((n) => (
                <Box
                  key={n}
                  sx={{
                    height: 260,
                    borderRadius: '20px',
                    background: `linear-gradient(100deg, ${roles.surfaceContainer} 30%, ${roles.surfaceContainerHighest} 50%, ${roles.surfaceContainer} 70%)`,
                    backgroundSize: '200% 100%',
                    animation: `askShimmer 1.4s linear infinite, askRise 500ms ${EASE} both`,
                    animationDelay: `0ms, ${n * 90}ms`,
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {phase === 'results' && answer && (
          <Box sx={{ mt: 4 }}>
            {answer.mode === 'ai' && answer.intent.summary && (
              <Typography variant="titleMedium" sx={chalkWrite} aria-live="polite">
                {answer.intent.summary}
              </Typography>
            )}
            {answer.intent.followups.length > 0 && (
              <Stack direction="row" sx={{ mt: 2, gap: 1, flexWrap: 'wrap' }}>
                {answer.intent.followups.map((text, index) => (
                  <Chip
                    key={text}
                    label={text}
                    size="small"
                    clickable
                    onClick={() => void ask(`${query} ${text}`)}
                    sx={{
                      animation: `askRise 400ms ${EASE} both`,
                      animationDelay: `${120 + index * 60}ms`,
                    }}
                  />
                ))}
              </Stack>
            )}
            {(answer.personal?.saved.length ?? 0) > 0 && (
              <Stack
                direction="row"
                className="c-rise"
                role="status"
                sx={{
                  mt: 2,
                  gap: 1,
                  alignItems: 'center',
                  px: 2,
                  py: 1,
                  borderRadius: 999,
                  bgcolor: roles.secondaryContainer,
                  color: roles.onSecondaryContainer,
                  width: 'fit-content',
                  maxWidth: '100%',
                }}
              >
                <Typography variant="labelLarge" noWrap>
                  {accountCopy.remembered.replace(
                    '{items}',
                    preferenceChips(account.profile, accountCopy, locale)
                      .filter((chip) => answer.personal!.saved.includes(chip.key))
                      .map((chip) => chip.label)
                      .join(' · ') || answer.personal!.saved.join(' · '),
                  )}
                </Typography>
                <Button size="small" onClick={() => setProfileOpen(true)} sx={{ minWidth: 0 }}>
                  {accountCopy.manage}
                </Button>
              </Stack>
            )}
            {total === 0 && (
              <Box sx={{ mt: 6, animation: `askRise 500ms ${EASE} both` }}>
                <Typography variant="titleLarge">{t.nothing}</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {t.tryAgain}
                </Typography>
              </Box>
            )}
            {answer.groups.map((group, groupIndex) => (
              <Box
                key={group.id}
                component="section"
                aria-label={group.id === 'for_you' ? accountCopy.forYou : t[group.id]}
                sx={{
                  mt: 5,
                  ...dealIn,
                  '--deal-index': groupIndex * 2,
                }}
              >
                <Typography component="h2" variant="titleLarge">
                  {group.id === 'for_you' ? accountCopy.forYou : t[group.id]}
                </Typography>
                <Box
                  sx={{
                    mt: 2,
                    mx: -4,
                    px: 4,
                    display: 'grid',
                    gridAutoFlow: 'column',
                    gridAutoColumns: 'min(78vw, 280px)',
                    gap: 3,
                    overflowX: 'auto',
                    scrollSnapType: 'x mandatory',
                    scrollPaddingInline: '16px',
                    pb: 2,
                    '&::-webkit-scrollbar': { display: 'none' },
                  }}
                >
                  {group.places.map((pick, index) => (
                    <PickCard
                      key={pick.id}
                      pick={pick}
                      delay={groupIndex * 140 + 120 + index * 70}
                      copy={t}
                      locale={locale}
                    />
                  ))}
                </Box>
              </Box>
            ))}
            <Stack direction="row" sx={{ mt: 6, gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<RotateCcw size={18} />}
                onClick={() => {
                  setPhase('idle')
                  setAnswer(null)
                  setQuery('')
                  requestAnimationFrame(() => input.current?.focus())
                }}
              >
                {t.newSearch}
              </Button>
              <Button
                component="a"
                href="/explore/browse"
                onClick={customerNavigate}
                endIcon={<ArrowRight size={18} />}
              >
                {t.browse}
              </Button>
            </Stack>
          </Box>
        )}

        {phase === 'idle' && <TodayDeck place={place} />}

        {phase === 'idle' && (
          <Box sx={{ mt: 8, animation: `askRise 600ms ${EASE} 600ms both` }}>
            <Button
              component="a"
              href="/explore/browse"
              onClick={customerNavigate}
              endIcon={<ArrowRight size={18} />}
            >
              {t.browse}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  )
}

function PickCard({
  pick,
  delay,
  copy,
  locale,
}: {
  pick: Pick
  delay: number
  copy: ReturnType<typeof askCopy>
  locale: string
}) {
  const roles = useTheme().material
  const item = pick.matched[0] ?? pick.items.find((i) => i.available)
  const distance = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: pick.distance_m < 1000 ? 'meter' : 'kilometer',
    maximumFractionDigits: 1,
  }).format(pick.distance_m < 1000 ? pick.distance_m : pick.distance_m / 1000)
  const chalkboard = pick.source === 'chalkboard'
  const reason = pick.reasons?.[0]
  return (
    <Box sx={{ position: 'relative', scrollSnapAlign: 'start' }}>
      <Box
        component="a"
        href={chalkboard ? `/explore/s/${pick.id}` : (pick.google_maps_uri ?? '#')}
        onClick={chalkboard ? customerNavigate : undefined}
        target={chalkboard ? undefined : '_blank'}
        rel={chalkboard ? undefined : 'noopener noreferrer'}
        sx={{
          scrollSnapAlign: 'start',
          display: 'block',
          color: 'inherit',
          textDecoration: 'none',
          borderRadius: '20px',
          overflow: 'hidden',
          bgcolor: roles.surfaceContainerLow,
          border: `1px solid ${roles.outlineVariant}`,
          ...dealIn,
          animationDelay: `${delay}ms`,
          transition: `transform 200ms ${EASE}`,
          '&:active': { transform: 'scale(0.98)' },
          '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
        }}
      >
        <Box sx={{ position: 'relative', aspectRatio: '16 / 11', overflow: 'hidden' }}>
          <PlaceImage
            id={pick.id}
            category={pick.category}
            photo={pick.photo_url}
            authors={pick.photo_authors ?? []}
            transition={chalkboard}
            compact
          />
          {(pick.demo_shop || pick.locally_made) && (
            <Stack direction="row" sx={{ position: 'absolute', top: 10, left: 10, gap: 1 }}>
              {pick.locally_made && (
                <Chip
                  label={locallyMadeLabel(locale as Locale)}
                  size="small"
                  sx={{
                    bgcolor: roles.tertiaryContainer,
                    color: roles.onTertiaryContainer,
                    fontWeight: 600,
                  }}
                />
              )}
              {pick.demo_shop && (
                <Chip label={copy.demo} size="small" sx={{ bgcolor: roles.surface }} />
              )}
            </Stack>
          )}
        </Box>
        {reason && (
          <Typography
            variant="labelMedium"
            sx={{ px: 3, pt: 2, color: roles.primary, fontWeight: 700 }}
          >
            {accountCopyFor(locale as Locale).reasons[reason] ?? reason}
          </Typography>
        )}
        <Box sx={{ p: 3 }}>
          <Typography variant="titleMedium" noWrap>
            {pick.name}
          </Typography>
          {item && pick.currency && (
            <Typography variant="bodyMedium" sx={{ mt: 0.5, fontWeight: 600 }} noWrap>
              {item.name} · {formatPrice(item.price, pick.currency)}
            </Typography>
          )}
          <Stack direction="row" sx={{ mt: 1, gap: 1.5, alignItems: 'center' }}>
            <Typography variant="bodySmall" color="text.secondary">
              {distance}
            </Typography>
            {pick.open_now !== null && (
              <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center' }}>
                <Box
                  aria-hidden="true"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: pick.open_now ? '#1e8e3e' : roles.outline,
                  }}
                />
                <Typography variant="bodySmall" color="text.secondary">
                  {pick.open_now ? copy.openNow : copy.closed}
                </Typography>
              </Stack>
            )}
            {!chalkboard && (
              <Typography variant="bodySmall" color="text.secondary" sx={{ ml: 'auto' }}>
                {copy.from}
              </Typography>
            )}
          </Stack>
        </Box>
      </Box>
      {chalkboard && (
        // A sibling of the link (never nested inside it), floating over the photo.
        <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
          <FollowButton id={pick.id} name={pick.name} variant="icon" />
        </Box>
      )}
    </Box>
  )
}
