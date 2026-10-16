import { useCallback, useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import {
  ArrowRight,
  Clock,
  Gem,
  Hand,
  Leaf,
  MessageCircleHeart,
  Search,
  Sparkles,
  Tag,
} from 'lucide-react'
import type { components } from '../../api/generated'
import { dealIn } from '../../design/chalkMotion'
import type { FeatureKey } from '../../design/chalkboard'
import { HAND_FONT, motion } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { useCustomer } from '../customer/account'
import { FollowButton } from '../customer/FollowButton'
import { customerNavigate } from '../frontdoors/navigation'
import { PlaceImage } from '../frontdoors/PlaceImage'
import { defaultCurrency, formatPrice } from '../v1/format'
import { FESTIVAL_ART } from './artData'
import { fill, usePassportCopy } from './copy'
import type { PassportStrings } from './copy'
import { usePassport } from './store'

type Feed = components['schemas']['TodayFeed']
type Find = components['schemas']['Find']
type Place = { lat: number; lng: number; label: string }

const MEMORY = 'chalkboard.today.v1'
type Memory = { day: string; ids: string[]; seen: Record<string, string> }

function memory(): Memory {
  try {
    const value = JSON.parse(localStorage.getItem(MEMORY) || 'null') as Memory | null
    if (value && typeof value.day === 'string' && Array.isArray(value.ids)) return value
  } catch {
    /* Optional storage. */
  }
  return { day: '', ids: [], seen: {} }
}
/** The feed day on this phone: it turns at 7 am local time, like the server's. */
function feedDay() {
  return new Intl.DateTimeFormat('en-CA').format(new Date(Date.now() - 7 * 3_600_000))
}
function remember(feed: Feed) {
  const prior = memory()
  const seen = { ...prior.seen }
  for (const find of feed.finds) seen[find.id] ??= feed.day
  const recent = Object.fromEntries(
    Object.entries(seen)
      .sort(([, a], [, b]) => a.localeCompare(b))
      .slice(-200),
  )
  try {
    localStorage.setItem(
      MEMORY,
      JSON.stringify({ day: feed.day, ids: feed.finds.map((f) => f.id), seen: recent }),
    )
  } catch {
    /* Optional storage. */
  }
}

const TONE: Record<Find['kind'], FeatureKey> = {
  only_one: 'lilac',
  rescue: 'coral',
  hidden_gem: 'sunflower',
  new_this_week: 'mint',
  locally_made: 'mint',
  festival: 'sunflower',
  tip: 'sky',
}
const ICON = {
  only_one: Search,
  rescue: Clock,
  hidden_gem: Gem,
  new_this_week: Tag,
  locally_made: Hand,
  festival: Sparkles,
  tip: MessageCircleHeart,
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function left(ms: number, locale: string) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) {
    const seconds = Math.max(0, Math.floor((ms % 60_000) / 1000))
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }
  const unit = (value: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value)
  return `${unit(Math.floor(minutes / 60), 'hour')} ${unit(minutes % 60, 'minute')}`
}

function distanceText(m: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: m < 1000 ? 'meter' : 'kilometer',
    maximumFractionDigits: 1,
  }).format(m < 1000 ? Math.round(m / 10) * 10 : m / 1000)
}

function when(daysAgo: number, locale: string) {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-daysAgo, 'day')
}

/** The words for one find, from its facts. */
function words(find: Find, t: PassportStrings, locale: string, now: number) {
  const p = find.params ?? {}
  const str = (key: string) => String(p[key] ?? '')
  const num = (key: string) => Number(p[key] ?? 0)
  const price = (key: string) =>
    p[key] == null ? '' : formatPrice(num(key), str('currency') || undefined, locale)
  const shop = find.shop
  switch (find.kind) {
    case 'only_one':
      return {
        hook: fill(t.onlyOne, { km: num('radius_km'), item: str('item') }),
        proof: fill(t.onlyOneProof, { n: num('shops'), km: num('radius_km') }),
      }
    case 'rescue': {
      const end = (find.ends_at ?? 0) * 1000
      return {
        hook: fill(t.rescueHook, {
          portions: num('portions'),
          item: str('item'),
          pct: num('discount_pct'),
          time: left(end - now, locale),
        }),
        proof: fill(t.rescueProof, {
          time: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(end),
        }),
      }
    }
    case 'hidden_gem':
      return { hook: `“${str('story')}”`, proof: t.gemProof }
    case 'new_this_week': {
      const update = str('update')
      const hook =
        update === 'price_change'
          ? fill(t.priceDrop, { item: str('item'), price: price('price'), old: price('old_price') })
          : update === 'back_in_stock'
            ? fill(t.backInStock, { item: str('item') })
            : fill(t.newItem, { item: str('item') })
      return { hook, proof: fill(t.updateProof, { when: when(num('days_ago'), locale) }) }
    }
    case 'locally_made':
      return {
        hook: fill(t.madeHere, { distance: distanceText(shop?.distance_m ?? 0, locale) }),
        proof: fill(t.madeHereProof, { category: (shop?.category || '').toLowerCase() }),
      }
    case 'festival': {
      const festival = (t[str('festival') as keyof PassportStrings] as string) || str('festival')
      return {
        hook: fill(t.festivalHook, { festival, n: num('stops') }),
        proof: fill(t.festivalProof, {
          date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
            new Date(`${str('ends')}T12:00:00`),
          ),
        }),
      }
    }
    default:
      return {
        hook: `“${str('text')}”`,
        proof: fill(t.tipProof, { author: str('author') }),
      }
  }
}

/**
 * Today's 7: a finite deck of neighbourhood finds that changes at 7 am. The same set all day;
 * after the last card comes "That's today's 7" and a countdown. Never padded with weak cards.
 */
export function TodayDeck({ place }: { place: Place }) {
  const t = usePassportCopy()
  const locale = useLocale()
  const account = useCustomer()
  const roles = useTheme().material
  const [result, setResult] = useState<{ key: string; feed?: Feed; failed?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const api = account.api
  const signedIn = account.status === 'signed-in'
  const request = `${place.lat},${place.lng},${place.label},${account.status},${attempt}`
  const load = useCallback(() => {
    const prior = memory()
    const params = new URLSearchParams({
      lat: place.lat.toFixed(5),
      lng: place.lng.toFixed(5),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      currency: defaultCurrency(),
      place: place.label.slice(0, 120),
    })
    if (!signedIn) {
      // Today's set stays all day; finds shown on the last 3 days rest.
      const today = feedDay()
      const cutoff = new Intl.DateTimeFormat('en-CA').format(
        new Date(Date.now() - 7 * 3_600_000 - 3 * 86_400_000),
      )
      const earlier = Object.entries(prior.seen)
        .filter(([, day]) => day !== today && day >= cutoff)
        .map(([id]) => id)
      if (earlier.length) params.set('seen', earlier.slice(-60).join(',').slice(0, 3900))
      if (prior.day === today && prior.ids.length)
        params.set('keep', prior.ids.join(',').slice(0, 1900))
    }
    api<Feed>(`/api/v1/public/today?${params}`, { signal: AbortSignal.timeout(30_000) })
      .then((data) => {
        if (!signedIn) remember({ ...data, day: feedDay() })
        setResult({ key: request, feed: data })
      })
      .catch(() => setResult((prior) => ({ key: request, feed: prior?.feed, failed: true })))
  }, [api, place.lat, place.lng, place.label, signedIn, request])
  useEffect(() => {
    if (account.status !== 'loading') load()
  }, [account.status, load])
  const feed = result?.feed ?? null
  const status = result?.key !== request ? 'loading' : result.failed ? 'error' : 'ready'

  const finds = feed?.finds ?? []
  const title = feed?.area.name ? fill(t.todayIn, { area: feed.area.name }) : t.todayNear
  return (
    <Box component="section" aria-labelledby="today-title" sx={{ mt: 7 }}>
      <Typography
        id="today-title"
        component="h2"
        sx={{ fontFamily: HAND_FONT, fontWeight: 700, fontSize: 34, lineHeight: 1.1 }}
      >
        {title}
      </Typography>
      {feed?.demo && (
        <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
          {t.demoLabel}
        </Typography>
      )}
      {status === 'loading' && !feed && (
        <Box aria-busy="true" sx={{ mt: 3 }}>
          <Typography variant="titleMedium" color="text.secondary" role="status">
            {t.sketching}
          </Typography>
          <Stack spacing={3} sx={{ mt: 3 }}>
            {[0, 1, 2].map((n) => (
              <Skeleton
                key={n}
                variant="rounded"
                height={n ? 220 : 340}
                sx={{ borderRadius: '28px', ...dealIn, '--deal-index': n }}
              />
            ))}
          </Stack>
        </Box>
      )}
      {status === 'error' && (
        <Alert
          severity="warning"
          sx={{ mt: 3 }}
          action={<Button onClick={() => setAttempt((n) => n + 1)}>{t.retry}</Button>}
        >
          {t.todayFailed}
        </Alert>
      )}
      {feed && finds.length === 0 && (
        <Typography variant="bodyLarge" sx={{ mt: 3, color: roles.onSurfaceVariant }}>
          {t.empty}
        </Typography>
      )}
      {finds.length > 0 && (
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: 3, display: 'grid', gap: 4 }}>
          {finds.map((find, index) => (
            <FindCard key={find.id} find={find} index={index} total={finds.length} />
          ))}
          <Box component="li">
            <Done feed={feed!} place={place} locale={locale} />
          </Box>
        </Box>
      )}
    </Box>
  )
}

function FindCard({ find, index, total }: { find: Find; index: number; total: number }) {
  const t = usePassportCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const tone = theme.chalk[TONE[find.kind]]
  const now = useNow(find.kind === 'rescue')
  const { hook, proof } = words(find, t, locale, now)
  const shop = find.shop
  const Icon =
    find.kind === 'festival'
      ? (FESTIVAL_ART[String(find.params?.art) as keyof typeof FESTIVAL_ART] ?? Sparkles)
      : ICON[find.kind]
  const ended = find.kind === 'rescue' && (find.ends_at ?? 0) * 1000 <= now
  const href =
    find.kind === 'festival'
      ? '/explore/passport#quests'
      : find.kind === 'rescue'
        ? '/explore/rescue'
        : shop
          ? `/explore/s/${shop.id}`
          : '#'
  const action = { go: t.go, hold: t.hold, save: t.go, trail: t.trail }[find.action]
  const lead = index === 0
  const tilt = `${((index % 3) - 1) * 1.5}deg`
  return (
    <Box
      component="li"
      sx={{
        ...dealIn,
        '--deal-index': index,
        '--deal-tilt': tilt,
        position: 'relative',
        borderRadius: '28px',
        overflow: 'hidden',
        bgcolor: roles.surfaceContainerLow,
        border: `2px solid ${tone.main}`,
        boxShadow: `0 4px 0 ${tone.main}`,
        opacity: ended ? 0.55 : 1,
      }}
    >
      {shop && (
        <Box
          sx={{
            position: 'relative',
            height: lead ? 200 : 132,
            overflow: 'hidden',
            borderBottom: `2px solid ${tone.main}`,
          }}
        >
          <PlaceImage id={shop.id} category={shop.category} photo={shop.photo_url} compact />
        </Box>
      )}
      <Stack
        direction="row"
        sx={{
          position: shop ? 'absolute' : 'static',
          top: 12,
          left: 12,
          right: 12,
          gap: 1,
          alignItems: 'center',
          px: shop ? 0 : 4,
          pt: shop ? 0 : 4,
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: tone.main,
            color: tone.onMain,
            transform: 'rotate(-6deg)',
          }}
        >
          <Icon size={20} />
        </Box>
        {find.demo && (
          <Chip
            size="small"
            label={t.sourceDemo}
            sx={{ bgcolor: roles.surface, color: roles.onSurface, fontWeight: 700 }}
          />
        )}
        <Chip
          size="small"
          label={fill(t.cardOf, { n: index + 1, total })}
          sx={{ ml: 'auto', bgcolor: roles.surface, color: roles.onSurface }}
        />
      </Stack>
      <Box sx={{ p: 4, pt: 3 }}>
        <Typography
          component="h3"
          sx={{
            fontFamily: HAND_FONT,
            fontWeight: 700,
            fontSize: lead ? 34 : 28,
            lineHeight: 1.12,
            overflowWrap: 'anywhere',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {hook}
        </Typography>
        <Typography variant="bodyMedium" sx={{ mt: 1.5, color: roles.onSurfaceVariant }}>
          {proof}
        </Typography>
        {shop && (
          <Typography variant="labelLarge" sx={{ mt: 2 }}>
            {shop.name.replace(/\s*\(Demo\)$/, '')} · {distanceText(shop.distance_m, locale)} ·{' '}
            {fill(t.walk, { n: shop.walk_min })}
          </Typography>
        )}
        <Stack direction="row" sx={{ mt: 3, gap: 2, alignItems: 'center' }}>
          <Button
            variant="contained"
            href={href}
            onClick={customerNavigate}
            disabled={ended}
            endIcon={find.kind === 'rescue' ? <Leaf size={18} /> : <ArrowRight size={18} />}
            sx={{
              bgcolor: tone.main,
              color: tone.onMain,
              '&:hover': { bgcolor: tone.main },
              boxShadow: `0 4px 0 ${theme.material.onSurface}`,
            }}
          >
            {action}
          </Button>
          {shop && <FollowButton id={shop.id} name={shop.name} variant="icon" />}
        </Stack>
      </Box>
    </Box>
  )
}

function Done({ feed, place, locale }: { feed: Feed; place: Place; locale: string }) {
  const t = usePassportCopy()
  const theme = useTheme()
  const roles = theme.material
  const now = useNow(true)
  const { view } = usePassport(place)
  return (
    <Box
      sx={{
        ...dealIn,
        '--deal-index': feed.finds.length,
        p: 5,
        borderRadius: '28px',
        textAlign: 'center',
        bgcolor: roles.surfaceContainer,
        border: `2px dashed ${roles.outlineVariant}`,
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 64 64"
        width={56}
        height={56}
        aria-hidden="true"
        sx={{
          color: theme.chalk.mint.main,
          '& path': {
            strokeDasharray: 80,
            strokeDashoffset: 0,
            animation: `chalkTick 600ms ${motion.easing.emphasizedDecelerate} both`,
          },
          '@keyframes chalkTick': { from: { strokeDashoffset: 80 }, to: { strokeDashoffset: 0 } },
        }}
      >
        <path
          d="M14 34 L27 46 L50 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Box>
      <Typography
        sx={{ fontFamily: HAND_FONT, fontWeight: 700, fontSize: 32, lineHeight: 1.1, mt: 1 }}
      >
        {fill(t.todayDone, { n: feed.finds.length })}
      </Typography>
      <Typography variant="bodyLarge" sx={{ mt: 1 }} role="timer">
        {fill(t.nextDrop, { time: left(feed.next_drop * 1000 - now, locale) })}
      </Typography>
      {view && (
        <Button
          href="/explore/passport"
          onClick={customerNavigate}
          variant="outlined"
          sx={{ mt: 3 }}
        >
          {t[view.level.key]} · {new Intl.NumberFormat(locale).format(view.total)} {t.points}
        </Button>
      )}
    </Box>
  )
}
