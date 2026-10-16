import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { gsap } from 'gsap'
import { Clock, Leaf, LocateFixed, MapPin, MessageCircle, Store } from 'lucide-react'
import { dealIn, useChalkTimeline } from '../../design/chalkMotion'
import { chalkDust } from '../../design/chalkboard'
import { HAND_FONT } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { chatPath, go } from '../customer/paths'
import { ensureDemoWorld } from '../discover/demoWorld'
import { fill, usePassportCopy } from '../passport/copy'
import { usePassport } from '../passport/store'
import { formatPrice } from '../v1/format'
import { useOnline } from '../v1/useOnline'
import { useRescueCopy } from './copy'
import { HoldSheet } from './HoldSheet'
import { clock, countdown, distanceText, useHolds, useNow } from './holds'
import type { Hold, PublicRescue } from './holds'

type Place = { lat: number; lng: number; label: string }
const FILTERS = 'chalkboard.discover.filters'
// The Ask home's default area, so a first visit shows the same neighbourhood.
const FALLBACK: Place = { lat: 1.2847, lng: 103.832, label: 'Tiong Bahru' }
const RADIUS = 3000
// The pin pulse doubles its speed in the last 30 minutes (1.6 s â†’ 0.8 s).
const URGENT = 30 * 60

const NON_FOOD_RESCUE_PATTERNS =
  /\b(repair|tyre|tire|patch|bicycle|bike|tailor|hem|haircut|salon|barber|plumb|electric)\b/i

function savedPlace(): Place {
  try {
    const place = (JSON.parse(localStorage.getItem(FILTERS) || '{}') as { place?: Place }).place
    if (place && Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
      if (place.label?.toLowerCase() === 'you') {
        return { ...place, label: 'Nearby' }
      }
      return place
    }
  } catch {
    /* Optional storage. */
  }
  return FALLBACK
}

/** The same remembered place as the Ask home, so both tabs show one neighbourhood. */
function rememberPlace(place: Place) {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS) || '{}') as object
    localStorage.setItem(FILTERS, JSON.stringify({ ...saved, place }))
  } catch {
    /* Optional storage. */
  }
}

/** Ending soonest Ã— distance: a deal 5 min away that ends in 20 min beats one 2 km off. */
function rank(row: PublicRescue, now: number) {
  const minutes = Math.max(1, (row.deal.ends * 1000 - now) / 60_000)
  return minutes * (0.5 + row.distance_m / 1000)
}

/**
 * The customer Rescue tab: live closing-time deals near the customer on a chalk map and in a
 * list, real countdowns (pins pulse faster in the last 30 min), "Hold one for me" through the
 * signed-in shop chat (no payments), the impact meter, and the phone's own holds.
 */
export function RescueScreen() {
  const t = useRescueCopy()
  const roles = useTheme().material
  const online = useOnline()
  const [place, setPlace] = useState(savedPlace)
  const [rows, setRows] = useState<PublicRescue[] | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [locating, setLocating] = useState(false)
  const [holding, setHolding] = useState<PublicRescue | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const myHolds = useHolds()
  const now = useNow()
  useEffect(() => {
    document.title = `${t.title} · Chalkboard`
  }, [t.title])

  useEffect(() => {
    let live = true
    const load = async (first: boolean) => {
      if (first) setStatus('loading')
      try {
        // Demo shops (and their labelled demo rescues) around the customer, like the Ask home.
        await ensureDemoWorld(place.lat, place.lng, place.label)
        const query = new URLSearchParams({
          lat: place.lat.toFixed(5),
          lng: place.lng.toFixed(5),
          radius: String(RADIUS),
        })
        const response = await fetch(`/api/v1/public/rescue?${query}`)
        if (!response.ok) throw new Error(String(response.status))
        const found = (await response.json()) as PublicRescue[]
        if (!live) return
        setRows(found)
        setStatus('ready')
      } catch {
        if (live && first) setStatus('error')
      }
    }
    void load(true)
    // Portions go as neighbours hold them; refresh quietly while the tab is open.
    const timer = setInterval(() => void load(false), 45_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [place, attempt])

  // Re-rank once a minute, not every tick: cards should not jump around while read.
  const minute = Math.floor(now / 60_000)
  const live = useMemo(
    () =>
      (rows ?? [])
        .filter((row) => {
          if (row.deal.ends <= minute * 60) return false
          const text = `${row.shop_name} ${row.deal.items.map((i) => i.name).join(' ')}`
          if (NON_FOOD_RESCUE_PATTERNS.test(text)) return false
          return true
        })
        .sort((a, b) => rank(a, minute * 60_000) - rank(b, minute * 60_000)),
    [rows, minute],
  )

  const locate = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        fetch(`/api/v1/discover/place?lat=${lat}&lng=${lng}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { label?: string } | null) => {
            const label = data?.label && data.label.toLowerCase() !== 'you' ? data.label : t.here
            const here = { lat, lng, label }
            rememberPlace(here)
            setPlace(here)
          })
          .catch(() => {
            const here = { lat, lng, label: t.here }
            rememberPlace(here)
            setPlace(here)
          })
      },
      () => setLocating(false),
      { timeout: 15_000, maximumAge: 30_000, enableHighAccuracy: true },
    )
  }, [t.here])

  function pick(id: string) {
    setFocus(id)
    const card = document.getElementById(`rescue-${id}`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card?.focus({ preventScroll: true })
  }

  return (
    <Box
      component="main"
      sx={{
        maxWidth: 720,
        mx: 'auto',
        px: 4,
        pt: 'max(20px, env(safe-area-inset-top))',
        pb: 'calc(120px + env(safe-area-inset-bottom))',
        minHeight: '100dvh',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, mr: '104px', minHeight: 56 }}>
        <Typography
          component="h1"
          sx={{ fontFamily: HAND_FONT, fontWeight: 700, fontSize: 38, lineHeight: 1.1 }}
        >
          {t.title}
        </Typography>
      </Stack>
      <Typography variant="bodyLarge" sx={{ color: roles.onSurfaceVariant }}>
        {fill(t.lead, { place: place.label })}
      </Typography>
      <Button
        size="small"
        startIcon={<LocateFixed size={18} />}
        onClick={locate}
        disabled={locating}
        sx={{ mt: 1, ml: -1 }}
      >
        {locating ? t.locating : t.useLocation}
      </Button>
      <Stack spacing={5} sx={{ mt: 3 }}>
        <Impact place={place} />
        {myHolds.length > 0 && <Holds holds={myHolds} now={now} />}
        {!online && <Alert severity="info">{t.offline}</Alert>}
        <RescueMap center={place} rows={live} now={now} onPick={pick} />
        {status === 'error' && !rows ? (
          <Alert
            severity="error"
            action={<Button onClick={() => setAttempt((n) => n + 1)}>{t.retry}</Button>}
          >
            {t.failed}
          </Alert>
        ) : status === 'loading' && !rows ? (
          <Box aria-busy="true">
            <Typography variant="bodyMedium" sx={{ mb: 2, color: roles.onSurfaceVariant }}>
              {t.loading}
            </Typography>
            <LinearProgress aria-label={t.loading} />
          </Box>
        ) : (
          <Box component="section" aria-labelledby="rescue-list-title">
            <Typography id="rescue-list-title" component="h2" variant="titleLarge" sx={{ mb: 2 }}>
              {t.listTitle}
            </Typography>
            {live.length === 0 ? (
              <EmptyState />
            ) : (
              <Stack component="ul" spacing={3} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {live.map((row, index) => (
                  <DealCard
                    key={row.deal.id}
                    row={row}
                    index={index}
                    now={now}
                    focused={focus === row.deal.id}
                    held={myHolds.find((h) => h.rescue === row.deal.id) ?? null}
                    canHold={online}
                    onHold={() => setHolding(row)}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Stack>
      {holding && (
        <HoldSheet
          row={holding}
          onClose={() => setHolding(null)}
          onChanged={(deal) =>
            setRows((all) => (all ?? []).map((r) => (r.deal.id === deal.id ? { ...r, deal } : r)))
          }
          onGone={() => setAttempt((n) => n + 1)}
        />
      )}
    </Box>
  )
}

function EmptyState() {
  const t = useRescueCopy()
  const theme = useTheme()
  return (
    <Box
      sx={{
        p: 5,
        borderRadius: '20px',
        border: `2px dashed ${theme.material.outlineVariant}`,
        textAlign: 'center',
      }}
    >
      <Box aria-hidden="true" sx={{ color: theme.chalk.coral.main, mb: 2 }}>
        <Leaf size={36} />
      </Box>
      <Typography variant="bodyLarge">{t.empty}</Typography>
    </Box>
  )
}

/** Meals rescued, CO2e (an estimate, sourced) and money saved: the customer's own totals. */
function Impact({ place }: { place: Place }) {
  const t = useRescueCopy()
  const p = usePassportCopy()
  const locale = useLocale()
  const theme = useTheme()
  const coral = theme.chalk.coral
  const { view } = usePassport(place)
  const scope = useRef<HTMLDivElement>(null)
  const meals = view?.impact.meals ?? 0
  const growth = [0, 1, 5, 12, 25, 50].filter((m) => meals >= m).length
  // The leaf grows to its size and the number counts up, once per visit.
  useChalkTimeline(
    scope,
    (root) => {
      gsap.from(root.querySelector('.impact-leaf'), {
        scale: 0.3,
        rotate: -30,
        duration: 0.6,
        ease: 'back.out(2)',
      })
      const counter = root.querySelector('.impact-count')
      if (!counter || !meals) return
      const value = { n: 0 }
      gsap.to(value, {
        n: meals,
        duration: 0.6,
        ease: 'power1.out',
        onUpdate: () => {
          counter.textContent = fill(p.meals, {
            n: new Intl.NumberFormat(locale).format(Math.round(value.n)),
          })
        },
      })
    },
    [meals],
  )
  if (!view) return null
  return (
    <Box
      ref={scope}
      component="section"
      aria-label={t.impact}
      sx={{
        p: 4,
        borderRadius: '20px',
        bgcolor: coral.container,
        color: coral.onContainer,
        display: 'flex',
        gap: 4,
        alignItems: 'center',
      }}
    >
      <Box
        aria-hidden="true"
        className="impact-leaf"
        sx={{ display: 'grid', placeItems: 'center', width: 56, height: 56, flexShrink: 0 }}
      >
        <Leaf size={18 + growth * 6} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          className="impact-count"
          component="p"
          variant="titleMedium"
          sx={{ fontWeight: 700 }}
        >
          {fill(p.meals, { n: new Intl.NumberFormat(locale).format(meals) })}
        </Typography>
        {meals > 0 && (
          <Typography variant="bodyMedium">
            {fill(p.co2, { kg: new Intl.NumberFormat(locale).format(view.impact.co2_kg) })}
            {Object.entries(view.impact.saved).map(
              ([currency, minor]) =>
                ` · ${fill(p.moneySaved, { amount: formatPrice(minor, currency, locale) })}`,
            )}
          </Typography>
        )}
        <Typography variant="bodySmall" sx={{ mt: 0.5, opacity: 0.85 }}>
          {p.co2Note}
        </Typography>
      </Box>
    </Box>
  )
}

/** The phone's holds: a countdown to pickup, the chat, and how to collect the stamp. */
function Holds({ holds, now }: { holds: Hold[]; now: number }) {
  const t = useRescueCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  return (
    <Box component="section" aria-labelledby="rescue-holds-title">
      <Typography id="rescue-holds-title" component="h2" variant="titleLarge" sx={{ mb: 2 }}>
        {t.holdsTitle}
      </Typography>
      <Stack spacing={2}>
        {holds.map((hold) => (
          <Box
            key={hold.rescue}
            sx={{
              p: 3,
              borderRadius: '20px',
              bgcolor: roles.surfaceContainer,
              border: `2px solid ${theme.chalk.coral.main}`,
            }}
          >
            <Stack direction="row" sx={{ gap: 2, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Typography component="p" variant="titleMedium" sx={{ flex: 1, minWidth: 0 }}>
                {fill(t.portions, { n: hold.qty, item: hold.item })}
              </Typography>
              {hold.demo && <Chip size="small" label={t.demo} />}
            </Stack>
            <Typography variant="bodyMedium" sx={{ color: roles.onSurfaceVariant }}>
              {hold.shopName} ·{' '}
              {hold.ends * 1000 > now
                ? fill(t.heldUntil, { time: clock(hold.ends, locale) })
                : t.ended}
            </Typography>
            <Typography variant="bodySmall" sx={{ mt: 1 }}>
              {t.collectHint}
            </Typography>
            <Button
              size="small"
              startIcon={<MessageCircle size={18} />}
              sx={{ mt: 1, ml: -1 }}
              onClick={() => go(chatPath(hold.shop, hold.thread))}
            >
              {t.openChat}
            </Button>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}

/**
 * A chalk sketch of the neighbourhood: you in the middle, distance rings, one pin per shop with
 * a live rescue. Pins pulse; the pulse doubles its speed in the last 30 minutes. It is drawn to
 * scale from real coordinates, not a street map, and every pin is a button to its card.
 */
function RescueMap({
  center,
  rows,
  now,
  onPick,
}: {
  center: Place
  rows: PublicRescue[]
  now: number
  onPick: (id: string) => void
}) {
  const t = useRescueCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const coral = theme.chalk.coral
  const scope = useRef<HTMLDivElement>(null)
  // One pin per shop: its soonest-ending deal.
  const pins = useMemo(() => {
    const byShop = new Map<string, PublicRescue>()
    for (const row of rows) {
      const seen = byShop.get(row.shop_id)
      if (!seen || row.deal.ends < seen.deal.ends) byShop.set(row.shop_id, row)
    }
    return [...byShop.values()]
  }, [rows])
  const far = Math.max(600, ...pins.map((p) => p.distance_m)) * 1.15
  const rings = [250, 500, 1000, 2000, 3000].filter((r) => r < far).slice(-3)
  const position = (lat: number, lng: number) => {
    const dx = (lng - center.lng) * Math.cos((center.lat * Math.PI) / 180) * 111_320
    const dy = (lat - center.lat) * 110_540
    return { x: 50 + (dx / far) * 50, y: 50 - (dy / far) * 50 }
  }
  const pinKey = pins.map((p) => p.deal.id).join()
  useChalkTimeline(
    scope,
    (root) => {
      gsap.from(root.querySelectorAll('.rescue-ring'), {
        attr: { r: 0 },
        duration: 0.7,
        stagger: 0.12,
        ease: 'power2.out',
      })
      gsap.from(root.querySelectorAll('.rescue-pin'), {
        scale: 0,
        opacity: 0,
        duration: 0.4,
        stagger: 0.08,
        delay: 0.25,
        ease: 'back.out(2.5)',
      })
    },
    [pinKey],
  )
  return (
    <Box
      ref={scope}
      component="figure"
      aria-label={t.mapLabel}
      sx={{
        m: 0,
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 0.72',
        borderRadius: '24px',
        overflow: 'hidden',
        bgcolor: theme.palette.mode === 'dark' ? roles.surfaceContainerLowest : '#24382D',
        color: '#F1EEE3',
        backgroundImage: chalkDust,
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 100 72"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {rings.map((r) => (
          <g key={r}>
            <circle
              className="rescue-ring"
              cx="50"
              cy="36"
              r={(r / far) * 50}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={0.35}
              strokeDasharray="1.2 1.2"
            />
            <text
              x={50 + (r / far) * 50 * 0.72}
              y={36 - (r / far) * 50 * 0.72}
              fontSize="2.6"
              fill="currentColor"
              fillOpacity={0.65}
            >
              {distanceText(r, locale)}
            </text>
          </g>
        ))}
      </Box>
      {/* You: the centre of the sketch. */}
      <Box
        aria-hidden="true"
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'grid',
          justifyItems: 'center',
          gap: 0.5,
        }}
      >
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            bgcolor: theme.chalk.sky.main,
            border: '3px solid #F1EEE3',
          }}
        />
        <Typography sx={{ fontFamily: HAND_FONT, fontSize: 18, lineHeight: 1 }}>{t.you}</Typography>
      </Box>
      {pins.map((row) => {
        const { x, y } = position(row.lat, row.lng)
        const seconds = row.deal.ends - now / 1000
        const urgent = seconds <= URGENT
        const item = row.deal.items.find((i) => i.qty_left > 0) ?? row.deal.items[0]!
        return (
          <Box
            key={row.shop_id}
            component="button"
            type="button"
            className="rescue-pin"
            aria-label={fill(t.pin, {
              shop: row.shop_name.replace(/\s*\(Demo\)$/, ''),
              item: item.name,
              time: countdown(seconds * 1000, locale),
            })}
            onClick={() => onPick(row.deal.id)}
            sx={{
              position: 'absolute',
              // The 48 px hit area stays on the map: the 0.72 aspect squashes y by the viewBox.
              left: `clamp(24px, ${x}%, calc(100% - 24px))`,
              top: `clamp(24px, ${50 + (y - 50) / 0.72}%, calc(100% - 24px))`,
              transform: 'translate(-50%, -50%)',
              width: 48,
              height: 48,
              p: 0,
              border: 0,
              borderRadius: '50%',
              bgcolor: 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              '&:focus-visible': { outline: `3px solid ${theme.chalk.sunflower.main}` },
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                width: 26,
                height: 26,
                borderRadius: '50%',
                bgcolor: coral.main,
                '@keyframes rescuePulse': {
                  from: { transform: 'scale(1)', opacity: 0.7 },
                  to: { transform: 'scale(2.3)', opacity: 0 },
                },
                animation: `rescuePulse ${urgent ? 0.8 : 1.6}s ease-out infinite`,
              }}
            />
            <Box
              aria-hidden="true"
              sx={{
                position: 'relative',
                width: 30,
                height: 30,
                borderRadius: '50%',
                bgcolor: coral.main,
                color: coral.onMain,
                border: '2px solid #F1EEE3',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Leaf size={16} />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

function DealCard({
  row,
  index,
  now,
  focused,
  held,
  canHold,
  onHold,
}: {
  row: PublicRescue
  index: number
  now: number
  focused: boolean
  held: Hold | null
  canHold: boolean
  onHold: () => void
}) {
  const t = useRescueCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const coral = theme.chalk.coral
  const deal = row.deal
  const ms = deal.ends * 1000 - now
  const urgent = ms <= URGENT * 1000
  const left = deal.items.reduce((sum, item) => sum + item.qty_left, 0)
  const top = deal.items.reduce((best, item) =>
    item.was - item.price > best.was - best.price ? item : best,
  )
  const pct = top.was ? Math.round((1 - top.price / top.was) * 100) : 0
  return (
    <Box
      component="li"
      id={`rescue-${deal.id}`}
      tabIndex={-1}
      aria-labelledby={`rescue-${deal.id}-shop`}
      style={{ '--deal-index': index, '--deal-tilt': `${((index % 3) - 1) * 1.5}deg` } as never}
      sx={{
        p: 4,
        borderRadius: '24px',
        bgcolor: roles.surfaceContainerLow,
        border: `2px solid ${focused ? coral.main : roles.outlineVariant}`,
        outline: 'none',
        '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
        ...dealIn,
      }}
    >
      <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Store size={18} aria-hidden="true" color={roles.onSurfaceVariant} />
        <Typography
          id={`rescue-${deal.id}-shop`}
          component="h3"
          variant="titleMedium"
          sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
        >
          {row.shop_name.replace(/\s*\(Demo\)$/, '')}
        </Typography>
        {deal.demo && (
          <Chip
            size="small"
            label={t.demo}
            sx={{ bgcolor: roles.surfaceContainerHighest, color: roles.onSurface }}
          />
        )}
      </Stack>
      <Stack spacing={1} sx={{ mt: 2 }}>
        {deal.items.map((item) => (
          <Stack
            key={item.name}
            direction="row"
            sx={{
              gap: 2,
              alignItems: 'baseline',
              flexWrap: 'wrap',
              opacity: item.qty_left ? 1 : 0.6,
            }}
          >
            <Typography
              component="p"
              variant="titleLarge"
              sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {item.name}
            </Typography>
            <Typography
              component="p"
              variant="titleLarge"
              sx={{ fontFamily: HAND_FONT, fontWeight: 700, color: coral.main, fontSize: 28 }}
            >
              {formatPrice(item.price, deal.currency, locale)}
            </Typography>
            <Typography
              variant="bodyMedium"
              sx={{ color: roles.onSurfaceVariant, textDecoration: 'line-through' }}
            >
              {/* Struck through for the eye; said in words ("Was ₹25") for a screen reader. */}
              <Box component="span" sx={visuallyHidden}>
                {fill(t.was, { price: formatPrice(item.was, deal.currency, locale) })}
              </Box>
              <span aria-hidden="true">{formatPrice(item.was, deal.currency, locale)}</span>
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" sx={{ mt: 2, gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          size="small"
          label={fill(t.off, { pct })}
          sx={{ bgcolor: coral.container, color: coral.onContainer, fontWeight: 700 }}
        />
        <Chip size="small" variant="outlined" label={fill(t.left, { n: left })} />
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: 0.5, color: roles.onSurfaceVariant }}
        >
          <MapPin size={16} aria-hidden="true" />
          <Typography variant="bodyMedium">
            {fill(t.away, { distance: distanceText(row.distance_m, locale) })}
          </Typography>
        </Stack>
      </Stack>
      {deal.pickup_note && (
        <Typography variant="bodyMedium" sx={{ mt: 2 }}>
          {fill(t.pickupNote, { note: deal.pickup_note })}
        </Typography>
      )}
      <Stack
        direction="row"
        sx={{
          mt: 3,
          gap: 3,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <Stack
          direction="row"
          role="timer"
          aria-live="off"
          sx={{
            alignItems: 'center',
            gap: 1,
            color: urgent ? coral.main : roles.onSurface,
            fontWeight: 700,
            '@keyframes rescueTick': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.55 },
            },
            animation: urgent ? 'rescueTick 1s ease-in-out infinite' : undefined,
          }}
        >
          <Clock size={18} aria-hidden="true" />
          <Typography
            component="p"
            variant="titleMedium"
            sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}
          >
            {ms > 0 ? fill(t.endsIn, { time: countdown(ms, locale) }) : t.ended}
          </Typography>
        </Stack>
        {held ? (
          <Button
            variant="outlined"
            startIcon={<MessageCircle size={18} />}
            onClick={() => go(chatPath(held.shop, held.thread))}
          >
            {`${t.held} · ${t.openChat}`}
          </Button>
        ) : (
          <Button
            variant="contained"
            startIcon={<Leaf size={18} />}
            disabled={!canHold || left === 0 || ms <= 0}
            onClick={onHold}
            sx={{
              bgcolor: coral.main,
              color: coral.onMain,
              '&:hover': { bgcolor: coral.main },
              boxShadow: `0 4px 0 ${roles.onSurface}`,
            }}
          >
            {t.hold}
          </Button>
        )}
      </Stack>
    </Box>
  )
}
