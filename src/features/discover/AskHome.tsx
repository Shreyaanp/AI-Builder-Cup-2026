import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  IconButton,
  InputBase,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  MapPin,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
  WifiOff,
} from 'lucide-react'
import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'
import { chalkWrite, dealIn } from '../../design/chalkMotion'
import { HAND_FONT } from '../../design/theme'
import { customerNavigate, goTo } from '../frontdoors/navigation'
import type { CustomerLocation } from '../frontdoors/CustomerApp'
import { useCustomer } from '../customer/account'
import { accountCopyFor } from '../customer/copy'
import { preferenceChips } from '../customer/preferences'
import { openedShops } from './opened'
import { ProfileSheet } from '../customer/Profile'
import { usePassportCopy } from '../passport/copy'
import { TodayDeck } from '../passport/TodayDeck'
import { AreaAnswerCard, GoogleRows, PickCard } from './AnswerCards'
import { AnswerMap, type MapSelection } from './AnswerMap'
import { askCopy } from './askStrings'
import {
  clearTurns,
  lastIntent,
  loadTurns,
  saveTurns,
  turnId,
  type AskAnswer,
  type Refine,
  type Suggestions,
  type Turn,
} from './askThread'
import { discoverCopy } from './strings'
import { fillIn, useConversationCopy, type ConversationCopy } from './conversationCopy'
import { ensureDemoWorld } from './demoWorld'
import { recsEvent } from '../recs/events'
import { PlaceSearch, type FoundPlace } from './PlaceSearch'
import '../customer/customer.css'

const FILTERS = 'chalkboard.discover.filters'
const FALLBACK: FoundPlace = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }
/** Nav bar (80) + composer (56) + breathing room. */
const COMPOSER_CLEARANCE = 'calc(176px + env(safe-area-inset-bottom))'

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

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    (new () => SpeechRecognitionLike) | null
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Singapore says MRT; elsewhere in English a station is a station. */
function transitLabel(copy: ConversationCopy, locale: Locale, place: FoundPlace) {
  const singapore = place.lat > 1.15 && place.lat < 1.48 && place.lng > 103.6 && place.lng < 104.1
  return locale === 'en' && !singapore ? 'Near a station?' : copy.transit
}

type Chip = { label: string; q: string; refine?: Refine; kind?: Turn['kind'] }

/**
 * The customer front door is a conversation (owner decision, 16 Oct): ask in your own words,
 * answers come back as cards with the exact item and price, and follow-ups keep the context
 * ("cheaper?", "open now?", "near the MRT?"). Today's 7 is one tap away in the same thread.
 */
export default function AskHome({
  initialLocation,
  onLocationChange,
  interests = [],
}: {
  initialLocation?: CustomerLocation | null
  onLocationChange?: (location: CustomerLocation) => void
  interests?: string[]
}) {
  const locale = useLocale()
  const t = askCopy(locale)
  const c = useConversationCopy()
  const discover = discoverCopy(locale)
  const passport = usePassportCopy()
  const roles = useTheme().material
  const account = useCustomer()
  const [place, setPlace] = useState<FoundPlace>(
    () =>
      (initialLocation?.gps
        ? { lat: initialLocation.gps[0], lng: initialLocation.gps[1], label: t.here }
        : initialLocation?.place) ??
      savedPlace() ??
      FALLBACK,
  )
  const [turns, setTurns] = useState<Turn[]>(loadTurns)
  const [draft, setDraft] = useState('')
  const [changing, setChanging] = useState(false)
  const [listening, setListening] = useState(false)
  const [suggested, setSuggested] = useState<{ key: string; data: Suggestions } | null>(null)
  const placeKey = `${place.lat},${place.lng}`
  const suggestions = suggested?.key === placeKey ? suggested.data : null
  const [profileOpen, setProfileOpen] = useState(false)
  const [line, setLine] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const recognizer = useRef<SpeechRecognitionLike | null>(null)
  const requests = useRef(new Map<string, AbortController>())
  const Speech = speechRecognition()
  const busy = turns.some((turn) => turn.status === 'thinking')

  useEffect(() => {
    document.title = `${c.hello} · Chalkboard`
  }, [c.hello])

  useEffect(() => saveTurns(turns), [turns])

  // Back from a shop or a chat lands where you were in the conversation.
  useEffect(() => {
    const y = (history.state as { scrollY?: number } | null)?.scrollY
    if (y) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }))
  }, [])

  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setLine((n) => (n + 1) % t.thinking.length), 1100)
    return () => clearInterval(timer)
  }, [busy, t.thinking.length])

  // Suggestion chips come from this area's own shops (labelled demo shops included).
  useEffect(() => {
    let live = true
    const key = `${place.lat},${place.lng}`
    void ensureDemoWorld(place.lat, place.lng, place.label)
      .then(() =>
        fetch(
          `/api/v1/discover/suggest?${new URLSearchParams({ lat: String(place.lat), lng: String(place.lng) })}`,
        ),
      )
      .then((response) => (response.ok ? (response.json() as Promise<Suggestions>) : null))
      .then((data) => {
        if (live && data) setSuggested({ key, data })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [place.lat, place.lng, place.label])

  const update = useCallback((id: string, patch: Partial<Turn>) => {
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)))
  }, [])

  const run = useCallback(
    async (turn: Turn) => {
      if (turn.kind === 'today') {
        update(turn.id, { status: 'done' })
        return
      }
      if (!navigator.onLine) {
        update(turn.id, { status: 'offline' })
        return
      }
      const controller = new AbortController()
      requests.current.set(turn.id, controller)
      update(turn.id, { status: 'thinking' })
      const started = performance.now()
      try {
        await ensureDemoWorld(turn.place.lat, turn.place.lng, turn.place.label)
        recsEvent({ kind: 'ask', query: turn.q })
        // Signed-in customers get "For you" ranking and stated preferences remembered.
        const answer = await account.api<AskAnswer>('/api/v1/discover/ask', {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({
            q: turn.q,
            lat: turn.place.lat,
            lng: turn.place.lng,
            language: locale,
            context: turn.context ?? null,
            refine: turn.refine ?? null,
            opened: openedShops(),
          }),
        })
        if (controller.signal.aborted) return
        if (answer.command) {
          const { kind, shop_id } = answer.command
          const path =
            kind === 'my_stamps'
              ? '/explore/passport'
              : (kind === 'follow' || kind === 'ask_owner') && shop_id
                ? `/explore/s/${encodeURIComponent(shop_id)}`
                : null
          if (path) {
            update(turn.id, { status: 'done', answer })
            goTo(path)
            return
          }
        }
        if (answer.personal) {
          // Keep the profile sheet in step with what was just remembered.
          void account
            .api<{ profile?: unknown }>('/api/v1/customer/me')
            .then((me) => {
              if (me.profile)
                account.setProfile(me.profile as Parameters<typeof account.setProfile>[0])
            })
            .catch(() => undefined)
        }
        // Let the thinking moment read as a moment, not a flicker.
        const wait = reduced() ? 0 : Math.max(0, 900 - (performance.now() - started))
        await new Promise((resolve) => setTimeout(resolve, wait))
        if (controller.signal.aborted) return
        update(turn.id, { status: 'done', answer })
      } catch {
        if (controller.signal.aborted) update(turn.id, { status: 'stopped' })
        else update(turn.id, { status: navigator.onLine ? 'failed' : 'offline' })
      } finally {
        requests.current.delete(turn.id)
      }
    },
    [account, locale, update],
  )

  // Offline turns try again by themselves when the connection is back.
  const latestTurns = useRef(turns)
  useEffect(() => {
    latestTurns.current = turns
  }, [turns])
  useEffect(() => {
    const online = () => {
      for (const turn of latestTurns.current) if (turn.status === 'offline') void run(turn)
    }
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [run])

  function send(text: string, options: { refine?: Refine; kind?: Turn['kind'] } = {}) {
    const q = text.trim()
    if (!q || busy) return
    const turn: Turn = {
      id: turnId(),
      kind: options.kind ?? 'ask',
      q,
      refine: options.refine ?? null,
      context: options.kind === 'today' ? null : lastIntent(turns),
      status: 'thinking',
      place,
    }
    setTurns((all) => [...all, turn])
    setDraft('')
    setLine(0)
    void run(turn)
    requestAnimationFrame(() =>
      document
        .getElementById(`turn-${turn.id}`)
        ?.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'start' }),
    )
  }

  function stop() {
    for (const controller of requests.current.values()) controller.abort()
  }

  function restart() {
    stop()
    clearTurns()
    setTurns([])
    setChanging(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() => input.current?.focus())
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
    let heard = ''
    recognition.onresult = (event) => {
      heard = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('')
      setDraft(heard)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => {
      setListening(false)
      if (heard.trim()) send(heard)
    }
    recognizer.current = recognition
    setListening(true)
    recognition.start()
  }

  const chips = startChips(suggestions, interests, c, t, discover)
  const last = turns.at(-1)
  const anyDemo = turns.some((turn) =>
    turn.answer?.groups.some((g) => g.places.some((p) => p.demo_shop || p.demo)),
  )

  return (
    <Box
      component="main"
      sx={{
        position: 'relative',
        minHeight: '100dvh',
        overflowX: 'clip',
        bgcolor: roles.surface,
        pb: COMPOSER_CLEARANCE,
      }}
    >
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <Box sx={{ maxWidth: 720, mx: 'auto', px: 4 }}>
        {/* Where we are looking, and a fresh start; the profile and theme buttons float right. */}
        <Stack
          direction="row"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 1100,
            mx: -4,
            px: 4,
            alignItems: 'center',
            gap: 2,
            pt: 'max(8px, env(safe-area-inset-top))',
            pb: 2,
            pr: { xs: '128px', md: 0 },
            minHeight: 64,
            bgcolor: roles.surface,
          }}
        >
          <Button
            onClick={() => setChanging((open) => !open)}
            aria-expanded={changing}
            aria-label={fillIn(c.area, { place: place.label })}
            startIcon={<MapPin size={18} aria-hidden="true" />}
            endIcon={<ChevronDown size={18} aria-hidden="true" />}
            sx={{
              minHeight: 48,
              minWidth: 0,
              px: 3,
              ml: -3,
              color: roles.onSurface,
              typography: 'titleSmall',
              '& .MuiButton-startIcon': { color: roles.primary },
            }}
          >
            <Box
              component="span"
              sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {place.label}
            </Box>
          </Button>
          {turns.length > 0 && (
            <Tooltip title={c.newChat}>
              <IconButton
                aria-label={c.newChat}
                onClick={restart}
                sx={{ ml: 'auto', width: 48, height: 48 }}
              >
                <RotateCcw size={20} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        {changing && (
          <Box className="c-rise" sx={{ mb: 4 }}>
            <PlaceSearch
              value={place.label}
              onFound={(found) => {
                setPlace(found)
                onLocationChange?.({ gps: null, place: found })
                rememberPlace(found)
                setChanging(false)
                // An open question is asked again for the new area.
                const previous = [...turns].reverse().find((turn) => turn.kind === 'ask')
                if (previous && !busy) {
                  const turn: Turn = {
                    ...previous,
                    id: turnId(),
                    place: found,
                    status: 'thinking',
                    answer: undefined,
                  }
                  setTurns((all) => [...all, turn])
                  void run(turn)
                }
              }}
            />
          </Box>
        )}

        {/* The assistant opens the conversation. */}
        <Box component="section" aria-labelledby="ask-hello" sx={{ pt: turns.length ? 2 : 10 }}>
          <Typography
            id="ask-hello"
            component="h1"
            variant={turns.length ? 'headlineSmall' : 'displaySmall'}
            sx={{ fontWeight: 500, letterSpacing: '-0.02em', maxWidth: '16ch', ...chalkWrite }}
          >
            {c.hello}
          </Typography>
          {turns.length === 0 && (
            <>
              <Typography
                variant="bodyLarge"
                color="text.secondary"
                sx={{ mt: 3, maxWidth: '42ch' }}
              >
                {suggestions?.shops
                  ? fillIn(c.helloBody, { count: suggestions.shops, place: place.label })
                  : fillIn(c.helloBodyEmpty, { place: place.label })}
              </Typography>
              <Box
                component="ul"
                aria-label={c.composer}
                sx={{
                  listStyle: 'none',
                  p: 0,
                  m: 0,
                  mt: 6,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                }}
              >
                {chips.map((chip, index) => (
                  <Box component="li" key={chip.label} sx={{ ...dealIn, '--deal-index': index }}>
                    <Button
                      variant="outlined"
                      onClick={() => send(chip.q, chip)}
                      disabled={busy}
                      sx={{ minHeight: 48, borderRadius: 999, px: 4, py: 2 }}
                    >
                      {chip.label}
                    </Button>
                  </Box>
                ))}
              </Box>
              <TodayEntry
                copy={c}
                onOpen={() => send(c.today, { kind: 'today' })}
                disabled={busy}
              />
            </>
          )}
        </Box>

        {/* The conversation so far. */}
        <Box sx={{ mt: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {turns.map((turn) => (
            <Box
              key={turn.id}
              id={`turn-${turn.id}`}
              component="article"
              aria-label={turn.q}
              sx={{ scrollMarginTop: 80 }}
            >
              <UserBubble text={turn.q} copy={c} />
              <AssistantTurn
                turn={turn}
                latest={turn === last}
                copy={c}
                locale={locale}
                line={t.thinking[line] ?? t.thinking[0]!}
                transit={transitLabel(c, locale, turn.place)}
                onSend={send}
                onRetry={() => void run(turn)}
                onCancel={() => setTurns((all) => all.filter((x) => x.id !== turn.id))}
                onManage={() => setProfileOpen(true)}
              />
            </Box>
          ))}
        </Box>
        {anyDemo && (
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 8 }}>
            {passport.demoLabel}
          </Typography>
        )}
        <Typography role="status" sx={visuallyHidden}>
          {last?.status === 'done' && last.answer
            ? count(last.answer)
              ? fillIn(c.found, { place: last.place.label })
              : fillIn(c.nothing, { q: last.q })
            : last?.status === 'failed'
              ? c.failed
              : last?.status === 'offline'
                ? c.offline
                : ''}
        </Typography>
      </Box>

      {/* The composer sits above the navigation bar, always within thumb reach. */}
      <Box
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'calc(80px + env(safe-area-inset-bottom))',
          zIndex: 1050,
          px: 4,
          pt: 4,
          pb: 3,
          background: `linear-gradient(to bottom, transparent, ${roles.surface} 40%)`,
          viewTransitionName: 'customer-composer',
        }}
      >
        <Box
          component="form"
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            send(draft)
          }}
          sx={{
            maxWidth: 720,
            mx: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pl: 5,
            pr: 1,
            minHeight: 56,
            borderRadius: 999,
            bgcolor: roles.surfaceContainerHigh,
            border: `1px solid ${listening ? roles.primary : roles.outlineVariant}`,
            boxShadow: listening ? `0 0 0 2px ${roles.primary}` : '0 4px 16px rgba(0,0,0,0.08)',
            transition: 'box-shadow 200ms ease, border-color 200ms ease',
          }}
        >
          <InputBase
            inputRef={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={listening ? t.listening : c.placeholder}
            inputProps={{ 'aria-label': c.composer, enterKeyHint: 'send', maxLength: 300 }}
            sx={{ flex: 1, minWidth: 0, minHeight: 48, fontSize: 16 }}
          />
          {Speech && !busy && (
            <IconButton
              aria-label={t.speak}
              aria-pressed={listening}
              onClick={listen}
              sx={{ width: 48, height: 48, color: listening ? roles.primary : undefined }}
            >
              <Mic size={22} />
            </IconButton>
          )}
          {busy ? (
            <IconButton
              aria-label={c.stop}
              onClick={stop}
              sx={{
                width: 48,
                height: 48,
                bgcolor: roles.surfaceContainerHighest,
                color: roles.onSurface,
                '&:hover': { bgcolor: roles.surfaceContainerHighest },
              }}
            >
              <Square size={16} fill="currentColor" />
            </IconButton>
          ) : (
            <IconButton
              type="submit"
              aria-label={c.send}
              disabled={!draft.trim()}
              sx={{
                width: 48,
                height: 48,
                bgcolor: roles.primary,
                color: roles.onPrimary,
                '&:hover': { bgcolor: roles.primary },
                '&.Mui-disabled': {
                  bgcolor: roles.surfaceContainerHighest,
                  color: roles.onSurfaceVariant,
                },
              }}
            >
              <ArrowUp size={20} />
            </IconButton>
          )}
        </Box>
      </Box>
    </Box>
  )
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

function count(answer: AskAnswer) {
  return answer.groups.reduce((n, g) => n + g.places.length, 0)
}

/** First-message chips: this area's real items and states first, then the person's interests. */
function startChips(
  s: Suggestions | null,
  interests: string[],
  c: ConversationCopy,
  t: ReturnType<typeof askCopy>,
  discover: ReturnType<typeof discoverCopy>,
): Chip[] {
  const chips: Chip[] = []
  for (const item of s?.items.slice(0, 2) ?? []) chips.push({ label: item, q: item })
  if (s?.deals) chips.push({ label: c.chipDeals, q: c.chipDeals, refine: 'deals' })
  if (s?.open_now) chips.push({ label: c.chipOpen, q: c.chipOpen, refine: 'open' })
  if (s?.locally_made) chips.push({ label: c.chipLocal, q: c.chipLocal, refine: 'local' })
  for (const interest of interests) {
    const key = (interest === 'café' ? 'cafe' : interest) as keyof typeof discover
    const label = typeof discover[key] === 'string' ? (discover[key] as string) : interest
    chips.push({ label, q: label })
  }
  for (const text of t.suggestions) chips.push({ label: text, q: text })
  const seen = new Set<string>()
  return chips.filter((chip) => !seen.has(chip.label) && seen.add(chip.label)).slice(0, 4)
}

function TodayEntry({
  copy,
  onOpen,
  disabled,
}: {
  copy: ConversationCopy
  onOpen: () => void
  disabled: boolean
}) {
  const theme = useTheme()
  const tone = theme.chalk.sunflower
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      disabled={disabled}
      sx={{
        mt: 8,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        p: 4,
        borderRadius: '20px',
        cursor: 'pointer',
        textAlign: 'start',
        font: 'inherit',
        // A calm card: the one sunflower accent is the small tile, not the whole surface.
        bgcolor: theme.material.surfaceContainerLow,
        color: theme.material.onSurface,
        border: `1px solid ${theme.material.outlineVariant}`,
        ...dealIn,
        '--deal-index': 5,
        '&:focus-visible': { outline: `3px solid ${theme.material.primary}`, outlineOffset: 2 },
        '&:disabled': { opacity: 0.6, cursor: 'default' },
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: '14px',
          display: 'grid',
          placeItems: 'center',
          bgcolor: tone.main,
          color: tone.onMain,
          transform: 'rotate(-4deg)',
        }}
      >
        <Sparkles size={22} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{ fontFamily: HAND_FONT, fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.1 }}
        >
          {copy.today}
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
          {copy.todayHint}
        </Typography>
      </Box>
      <ArrowRight size={20} aria-hidden="true" />
    </Box>
  )
}

function UserBubble({ text, copy }: { text: string; copy: ConversationCopy }) {
  const roles = useTheme().material
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Typography
        className="c-send"
        sx={{
          maxWidth: '80%',
          px: 4,
          py: 2,
          borderRadius: '20px 20px 4px 20px',
          bgcolor: roles.primaryContainer,
          color: roles.onPrimaryContainer,
          overflowWrap: 'anywhere',
        }}
      >
        <Box component="span" sx={visuallyHidden}>
          {copy.you}:{' '}
        </Box>
        {text}
      </Typography>
    </Box>
  )
}

function AssistantTurn({
  turn,
  latest,
  copy,
  locale,
  line,
  transit,
  onSend,
  onRetry,
  onCancel,
  onManage,
}: {
  turn: Turn
  latest: boolean
  copy: ConversationCopy
  locale: Locale
  line: string
  transit: string
  onSend: (text: string, options?: { refine?: Refine }) => void
  onRetry: () => void
  onCancel: () => void
  onManage: () => void
}) {
  const roles = useTheme().material
  const t = askCopy(locale)
  const account = useCustomer()
  const accountCopy = accountCopyFor(locale)
  // Pins and cards are linked both ways: tap a pin, its card lights up; focus a card, its pin.
  const [selected, setSelected] = useState<MapSelection>(null)
  if (turn.kind === 'today')
    return (
      // The deck carries its own title ("Today near …"): no second heading above it.
      <Box className="c-receive" sx={{ mt: 2 }}>
        <TodayDeck place={turn.place} />
      </Box>
    )
  if (turn.status === 'thinking')
    return (
      <Box sx={{ mt: 4 }} aria-busy="true">
        <Stack direction="row" sx={{ alignItems: 'center', gap: 3, color: roles.onSurfaceVariant }}>
          <Box className="c-typing" aria-hidden="true">
            <span />
            <span />
            <span />
          </Box>
          <Typography key={line} className="c-rise" variant="bodyMedium">
            {line}
          </Typography>
        </Stack>
        <Box
          aria-hidden="true"
          sx={{
            mt: 4,
            display: 'grid',
            gridAutoFlow: 'column',
            gridAutoColumns: 'min(78vw, 272px)',
            gap: 3,
            overflow: 'hidden',
          }}
        >
          {[0, 1].map((n) => (
            <Box
              key={n}
              className="c-shimmer"
              sx={{ height: 240, borderRadius: '20px', bgcolor: roles.surfaceContainer }}
            />
          ))}
        </Box>
      </Box>
    )
  if (turn.status !== 'done' || !turn.answer)
    return (
      <Box
        role={turn.status === 'stopped' ? undefined : 'alert'}
        className="c-receive"
        sx={{
          mt: 4,
          p: 4,
          borderRadius: '16px',
          bgcolor: turn.status === 'stopped' ? roles.surfaceContainerLow : roles.errorContainer,
          color: turn.status === 'stopped' ? roles.onSurface : roles.onErrorContainer,
        }}
      >
        <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
          {turn.status === 'offline' && <WifiOff size={18} aria-hidden="true" />}
          <Typography variant="bodyMedium">
            {turn.status === 'offline'
              ? copy.offline
              : turn.status === 'stopped'
                ? copy.stopped
                : copy.failed}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ mt: 3, gap: 2 }}>
          <Button variant="contained" onClick={onRetry} sx={{ minHeight: 48 }}>
            {copy.retry}
          </Button>
          <Button onClick={onCancel} sx={{ minHeight: 48, color: 'inherit' }}>
            {copy.cancel}
          </Button>
        </Stack>
      </Box>
    )
  const answer = turn.answer
  if (answer.command?.kind === 'directions' && answer.command.maps_url) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography variant="titleLarge">{answer.command.shop_name}</Typography>
        <Button
          variant="contained"
          href={answer.command.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<MapPin size={18} />}
          sx={{ mt: 2 }}
        >
          {discoverCopy(locale).maps}
        </Button>
      </Box>
    )
  }
  const intent = answer.intent
  const ours = answer.groups
    .filter((g) => g.id === 'for_you' || g.id === 'best')
    .flatMap((g) => g.places)
  const google = answer.groups
    .filter((g) => g.id === 'open' || g.id === 'more')
    .flatMap((g) => g.places)
    .slice(0, 3)
  const applied = [
    intent.sort === 'price' && copy.sortPrice,
    intent.sort === 'distance' && copy.sortDistance,
    intent.open_now && copy.openOnly,
    intent.deals && copy.dealsOnly,
    intent.near === 'transit' &&
      (answer.anchor ? fillIn(copy.nearStation, { station: answer.anchor.name }) : copy.noStation),
  ].filter(Boolean) as string[]
  const refinements: Chip[] = [
    intent.sort !== 'price' && { label: copy.cheaper, q: copy.cheaper, refine: 'price' as const },
    !intent.open_now && { label: copy.open, q: copy.open, refine: 'open' as const },
    intent.near !== 'transit' && { label: transit, q: transit, refine: 'transit' as const },
    !intent.deals && { label: copy.deals, q: copy.deals, refine: 'deals' as const },
  ].filter(Boolean) as Chip[]
  const followups: Chip[] = [
    ...refinements.slice(0, 3),
    ...(intent.followups ?? []).slice(0, 1).map((text) => ({ label: text, q: text })),
  ]
  const area = answer.area ?? null
  const nothing = ours.length === 0 && google.length === 0 && !(area?.status === 'ok')
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="bodyLarge" sx={chalkWrite}>
        {nothing
          ? fillIn(copy.nothing, { q: intent.keywords?.join(' ') || turn.q })
          : answer.mode === 'ai' && intent.summary
            ? intent.summary
            : fillIn(copy.found, { place: turn.place.label })}
      </Typography>
      {applied.length > 0 && (
        <Typography variant="labelLarge" color="text.secondary" sx={{ mt: 1 }}>
          {applied.join(' · ')}
        </Typography>
      )}
      {nothing && (
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
          {copy.nothingHint}
        </Typography>
      )}
      {(answer.personal?.saved.length ?? 0) > 0 && (
        <Stack
          direction="row"
          role="status"
          sx={{ mt: 2, gap: 2, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Typography variant="labelLarge" color="text.secondary">
            {accountCopy.remembered.replace(
              '{items}',
              preferenceChips(account.profile, accountCopy, locale)
                .filter((chip) => answer.personal!.saved.includes(chip.key))
                .map((chip) => chip.label)
                .join(' · ') || answer.personal!.saved.join(' · '),
            )}
          </Typography>
          <Button onClick={onManage} sx={{ minHeight: 48 }}>
            {accountCopy.manage}
          </Button>
        </Stack>
      )}
      {ours.length > 0 && (
        <>
          <Box
            component="ul"
            aria-label={fillIn(copy.found, { place: turn.place.label })}
            // A scrolling row must be reachable by keyboard (axe scrollable-region-focusable).
            tabIndex={0}
            sx={{
              m: 0,
              mt: 4,
              mx: { xs: -4, md: 0 },
              px: { xs: 4, md: 0 },
              display: 'grid',
              gridAutoFlow: { xs: 'column', md: 'row' },
              gridAutoColumns: 'min(78vw, 272px)',
              gridTemplateColumns: { md: 'repeat(auto-fill, minmax(208px, 1fr))' },
              gap: 3,
              overflowX: { xs: 'auto', md: 'visible' },
              scrollSnapType: 'x mandatory',
              scrollPaddingInline: '16px',
              pb: 2,
              scrollbarWidth: 'none',
              '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
            }}
          >
            {ours.slice(0, 8).map((pick, index) => (
              <PickCard
                key={pick.id}
                pick={pick}
                index={index}
                anchor={answer.anchor}
                copy={copy}
                locale={locale}
                selected={selected?.id === pick.id && selected.from === 'pin'}
                onFocusPin={() => setSelected({ id: pick.id, from: 'card' })}
              />
            ))}
          </Box>
        </>
      )}
      {area && <AreaAnswerCard area={area} locale={locale} />}
      <AnswerMap
        answer={answer}
        ours={ours.slice(0, 8)}
        center={turn.place}
        locale={locale}
        selected={selected}
        onSelect={setSelected}
      />
      {google.length > 0 && <GoogleRows places={google} copy={copy} locale={locale} />}
      {latest && (
        <>
          <Box
            component="ul"
            sx={{ listStyle: 'none', p: 0, m: 0, mt: 6, display: 'flex', flexWrap: 'wrap', gap: 2 }}
          >
            {followups.map((chip, index) => (
              <Box component="li" key={chip.label} sx={{ ...dealIn, '--deal-index': index + 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => onSend(chip.q, chip)}
                  sx={{ minHeight: 48, borderRadius: 999, px: 4, py: 2 }}
                >
                  {chip.label}
                </Button>
              </Box>
            ))}
          </Box>
          <Button
            component="a"
            href="/explore/browse"
            onClick={customerNavigate}
            endIcon={<ArrowRight size={18} />}
            sx={{ mt: 4, minHeight: 48, ml: -3 }}
          >
            {t.browse}
          </Button>
        </>
      )}
    </Box>
  )
}
