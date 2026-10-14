import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { MapPin, Search } from 'lucide-react'
import { systemLocale } from '../../i18n/locales'
import { loadScriptFont } from '../../i18n/fonts'
import { enterRise, shape } from '../../design/theme'
import { Sheet } from '../v1/Sheet'
import { formatPrice } from '../v1/format'
import { discoverCopy } from './strings'
import { mapsLink } from './types'
import type { Discovery, Place, Usual } from './types'

const DiscoverMap = lazy(() => import('./DiscoverMap'))
const areas = {
  'Tiong Bahru': [1.2847, 103.832],
  Chinatown: [1.283, 103.843],
  Bugis: [1.3007, 103.855],
  Orchard: [1.3048, 103.8318],
  'Jurong East': [1.3331, 103.7423],
  Tampines: [1.3547, 103.9437],
} as const
type Area = keyof typeof areas
const categories = {
  kopi: 'kopi',
  hawker: 'hawker',
  bakery: 'bakery',
  cafe: 'café',
  grocery: 'grocery',
  catering: 'catering',
} as const
const categoryLabels: Record<string, keyof typeof categories> = {
  kopi: 'kopi',
  hawker: 'hawker',
  food_court: 'hawker',
  bakery: 'bakery',
  cafe: 'cafe',
  café: 'cafe',
  grocery: 'grocery',
  grocery_store: 'grocery',
  supermarket: 'grocery',
  catering: 'catering',
  catering_service: 'catering',
}
type Filters = {
  q: string
  category: string
  open: boolean
  halal: boolean
  budget: boolean
  area: Area
}
const preferenceKey = 'chalkboard.discover.filters'
const usualsKey = 'chalkboard.discover.usuals'
function readFilters(): Filters {
  let saved: Partial<Filters> = {}
  try {
    saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}') as Partial<Filters>
  } catch {
    /* Optional storage. */
  }
  const url = new URLSearchParams(location.search)
  const area = url.get('area') ?? saved?.area
  const category = url.get('category') ?? saved?.category
  return {
    q: (url.get('q') ?? (typeof saved?.q === 'string' ? saved.q : '')).slice(0, 180),
    category: Object.values(categories).some((value) => value === category) ? category! : '',
    open: url.has('open') ? url.get('open') === '1' : saved?.open === true,
    halal: url.has('halal') ? url.get('halal') === '1' : saved?.halal === true,
    budget: url.has('budget') ? url.get('budget') === '1' : saved?.budget === true,
    area: typeof area === 'string' && Object.hasOwn(areas, area) ? (area as Area) : 'Tiong Bahru',
  }
}
function readUsuals(): Usual[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(usualsKey) || '[]')
    if (Array.isArray(value))
      return value
        .filter(
          (row): row is Usual =>
            row &&
            typeof row.id === 'string' &&
            typeof row.name === 'string' &&
            ['chalkboard', 'google'].includes(row.source),
        )
        .slice(0, 6)
  } catch {
    /* Optional storage. */
  }
  return []
}

export default function Discover() {
  // Public customers follow their phone language independently of owner preferences.
  const locale = systemLocale()
  const t = discoverCopy(locale)
  const roles = useTheme().material
  const [filters, setFilters] = useState(readFilters)
  const [query, setQuery] = useState(filters.q)
  const [gps, setGps] = useState<[number, number] | null>(null)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsError, setGpsError] = useState(false)
  const [result, setResult] = useState<Discovery | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  const [map, setMap] = useState(false)
  const [selected, setSelected] = useState<Usual | null>(null)
  const [usuals, setUsuals] = useState(readUsuals)
  const [lat, lng] = gps ?? areas[filters.area]
  useEffect(() => {
    document.title = t.title + ' · Chalkboard'
    document.documentElement.lang = locale
    void loadScriptFont(locale)
  }, [locale, t.title])
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(filters))
    } catch {
      /* Optional storage. */
    }
    const url = new URL(location.href)
    for (const [key, value] of Object.entries({
      q: filters.q,
      category: filters.category,
      area: filters.area,
      open: filters.open ? '1' : '0',
      halal: filters.halal ? '1' : '0',
      budget: filters.budget ? '1' : '0',
    }))
      url.searchParams.set(key, value)
    history.replaceState(null, '', url)
  }, [filters])
  useEffect(() => {
    const restore = () => {
      const restored = readFilters()
      setFilters(restored)
      setQuery(restored.q)
      setGps(null)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => {
    // Shared menu availability stays current while the customer is viewing the feed.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRetry((value) => value + 1)
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: '3000',
      q: filters.q,
      category: filters.category,
      open_now: String(filters.open),
    })
    // Abort old responses on filter/location changes, including a slow GPS handoff.
    async function load() {
      setStatus('loading')
      try {
        const response = await fetch('/api/v1/discover?' + params, { signal: abort.signal })
        if (!response.ok) throw new Error('Discovery unavailable')
        const data = (await response.json()) as Discovery
        if (!abort.signal.aborted) {
          setResult(data)
          setStatus('ready')
        }
      } catch {
        if (!abort.signal.aborted) setStatus('error')
      }
    }
    void load()
    return () => abort.abort()
  }, [lat, lng, filters.q, filters.category, filters.open, retry])

  function remember(place: Usual) {
    const minimal: Usual = {
      id: place.id,
      name: place.name,
      source: place.source,
      demo: place.demo,
      google_maps_uri: mapsLink(place.google_maps_uri) ?? null,
    }
    const next = [minimal, ...usuals.filter((row) => row.id !== place.id)].slice(0, 6)
    setUsuals(next)
    try {
      localStorage.setItem(usualsKey, JSON.stringify(next))
    } catch {
      /* Optional storage. */
    }
  }
  function openPlace(place: Usual) {
    remember(place)
    if (place.source === 'google') setSelected(place)
  }
  function locate() {
    setGpsBusy(true)
    setGpsError(false)
    if (!navigator.geolocation) {
      setGpsBusy(false)
      setGpsError(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps([position.coords.latitude, position.coords.longitude])
        setGpsBusy(false)
      },
      () => {
        setGpsError(true)
        setGpsBusy(false)
      },
      { timeout: 10_000, maximumAge: 60_000, enableHighAccuracy: false },
    )
  }
  const places = useMemo(
    () =>
      (result?.places ?? []).filter(
        (place) =>
          (!filters.halal || place.halal === true) &&
          (!filters.budget ||
            place.price_level === 'PRICE_LEVEL_INEXPENSIVE' ||
            (place.currency === 'SGD' &&
              place.items.some((item) => item.available && item.price <= 1000))),
      ),
    [result, filters.halal, filters.budget],
  )
  const details = result?.places.find((place) => place.id === selected?.id)
  const link = mapsLink(selected?.google_maps_uri)
  function distanceText(place: Place) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: place.distance_m < 1000 ? 'meter' : 'kilometer',
      maximumFractionDigits: 1,
    }).format(place.distance_m < 1000 ? place.distance_m : place.distance_m / 1000)
  }
  function statusText(place: Place) {
    return place.open_now === null ? t.unknown : place.open_now ? t.open : t.closed
  }
  function categoryText(value: string) {
    const key = categoryLabels[value.toLowerCase()]
    return key ? t[key] : value.replaceAll('_', ' ')
  }
  const controlSx = {
    minHeight: 48,
    maxWidth: '100%',
    height: 'auto',
    '& .MuiChip-label': { py: 2, whiteSpace: 'normal' },
  }

  return (
    <Box
      component="main"
      sx={{
        maxWidth: 1100,
        mx: 'auto',
        px: { xs: 4, md: 8 },
        pt: 6,
        pb: 'max(24px, env(safe-area-inset-bottom))',
        color: roles.onSurface,
      }}
    >
      <Stack spacing={5}>
        <Typography variant="headlineLarge" component="h1">
          {t.title}
        </Typography>
        <Stack
          component="form"
          direction="row"
          spacing={2}
          onSubmit={(event) => {
            event.preventDefault()
            setFilters({ ...filters, q: query.trim() })
          }}
        >
          <TextField
            fullWidth
            label={t.search}
            placeholder={t.hint}
            name="q"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 180 } }}
          />
          <Button
            type="submit"
            variant="contained"
            aria-label={t.submit}
            sx={{ minWidth: 48, px: 3 }}
          >
            <Search aria-hidden size={22} />
          </Button>
        </Stack>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
          {Object.entries(categories).map(([key, category]) => (
            <Chip
              key={key}
              label={t[key as keyof typeof categories]}
              clickable
              aria-pressed={filters.category === category}
              color={filters.category === category ? 'primary' : 'default'}
              sx={controlSx}
              onClick={() =>
                setFilters({ ...filters, category: filters.category === category ? '' : category })
              }
            />
          ))}
        </Stack>
        <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 4 }}>
          <FormControlLabel
            control={
              <Switch
                checked={filters.open}
                onChange={(_, open) => setFilters({ ...filters, open })}
              />
            }
            label={t.open}
          />
          <FormControlLabel
            control={
              <Switch
                checked={filters.halal}
                onChange={(_, halal) => setFilters({ ...filters, halal })}
              />
            }
            label={t.halal}
          />
          <FormControlLabel
            control={
              <Switch
                checked={filters.budget}
                onChange={(_, budget) => setFilters({ ...filters, budget })}
              />
            }
            label={`${t.budget} · ${formatPrice(1000, 'SGD', locale)}`}
          />
        </Stack>
        <Typography variant="bodyMedium" color="text.secondary">
          {t.reason}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
          <TextField
            select
            fullWidth
            label={t.area}
            value={gps ? '' : filters.area}
            onChange={(event) => {
              setGps(null)
              setGpsError(false)
              setFilters({ ...filters, area: event.target.value as Area })
            }}
          >
            {gps && <MenuItem value="">{t.current}</MenuItem>}
            {Object.keys(areas).map((area) => (
              <MenuItem key={area} value={area}>
                {area}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="outlined"
            disabled={gpsBusy}
            onClick={locate}
            startIcon={gpsBusy ? <CircularProgress size={18} /> : <MapPin aria-hidden size={18} />}
            sx={{ flexShrink: 0 }}
          >
            {t.gps}
          </Button>
        </Stack>
        {gpsError && <Alert severity="info">{t.gpsError}</Alert>}
        {result?.mode === 'demo' && (
          <Alert severity="info">
            <strong>{t.demo}</strong>
            <br />
            {t.demoNote}
          </Alert>
        )}
        {result?.google_unavailable && <Alert severity="warning">{t.partial}</Alert>}
        {usuals.length > 0 && (
          <Box>
            <Typography variant="titleLarge" component="h2">
              {t.usuals}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary" sx={{ mb: 3 }}>
              {t.usualsNote}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              {usuals.map((place) =>
                place.source === 'chalkboard' ? (
                  <Button
                    key={place.id}
                    component="a"
                    href={`/s/${encodeURIComponent(place.id)}`}
                    variant="outlined"
                    onClick={() => remember(place)}
                  >
                    {place.name}
                  </Button>
                ) : (
                  <Button key={place.id} variant="outlined" onClick={() => openPlace(place)}>
                    {place.name}
                  </Button>
                ),
              )}
            </Stack>
          </Box>
        )}
        <Box>
          <Button variant="outlined" aria-pressed={map} onClick={() => setMap(!map)}>
            {map ? t.list : t.map}
          </Button>
        </Box>
        <Box role="status" aria-live="polite">
          {status === 'loading' && (
            <Stack direction="row" spacing={3}>
              <CircularProgress size={24} />
              <Typography>{t.loading}</Typography>
            </Stack>
          )}
          {status === 'error' && (
            <Alert
              severity="error"
              action={<Button onClick={() => setRetry(retry + 1)}>{t.retry}</Button>}
            >
              {t.error}
            </Alert>
          )}
          {status === 'ready' && places.length === 0 && <Typography>{t.empty}</Typography>}
        </Box>
        {map && status === 'ready' && (
          <Suspense fallback={<Typography role="status">{t.loading}</Typography>}>
            <DiscoverMap
              places={places}
              center={{ lat, lng }}
              demo={result?.mode === 'demo'}
              onOpen={openPlace}
              unavailable={t.mapError}
              loading={t.loading}
              demoLabel={t.demoNote}
            />
          </Suspense>
        )}
        {status === 'ready' && (
          <Box
            component="ul"
            sx={{
              p: 0,
              m: 0,
              listStyle: 'none',
              display: 'grid',
              gap: 4,
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            }}
          >
            {places.map((place) => (
              <Card
                component="li"
                variant="outlined"
                key={place.id}
                sx={{
                  borderRadius: `${shape.lg}px`,
                  bgcolor: roles.surfaceContainerLow,
                  ...enterRise,
                }}
              >
                <CardActionArea
                  {...(place.source === 'chalkboard'
                    ? { component: 'a', href: `/s/${encodeURIComponent(place.id)}` }
                    : {})}
                  onClick={() => openPlace(place)}
                  sx={{ p: 4, height: '100%', display: 'block', textAlign: 'start' }}
                >
                  <Stack spacing={3}>
                    <Typography
                      component="h2"
                      variant="titleLarge"
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {place.name}
                    </Typography>
                    <Typography variant="bodyMedium" color="text.secondary">
                      {categoryText(place.category)} · {distanceText(place)}
                    </Typography>
                    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
                      <Chip label={statusText(place)} size="small" />
                      <Chip
                        label={
                          (place.source === 'google' ? t.google : t.chalkboard) +
                          (place.demo && place.source === 'google' ? ` · ${t.demo}` : '')
                        }
                        size="small"
                        variant="outlined"
                      />
                      {place.demo && place.source === 'chalkboard' && (
                        <Chip label={`${t.pin} · ${t.demo}`} size="small" />
                      )}
                    </Stack>
                    {place.source === 'google' && place.rating != null && (
                      <Typography variant="bodyMedium" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        ★ {new Intl.NumberFormat(locale).format(place.rating)} (
                        {new Intl.NumberFormat(locale).format(place.user_rating_count ?? 0)})
                      </Typography>
                    )}
                    {place.items.map((item) => (
                      <Typography
                        key={item.name + item.unit}
                        variant="bodyMedium"
                        sx={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {item.name} · {formatPrice(item.price, place.currency ?? 'SGD', locale)}
                      </Typography>
                    ))}
                    {place.sold_out.length > 0 && (
                      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
                        {place.sold_out.map((name) => (
                          <Chip
                            key={name}
                            label={`${name} · ${t.soldOut}`}
                            size="small"
                            sx={{
                              maxWidth: '100%',
                              height: 'auto',
                              '& .MuiChip-label': { whiteSpace: 'normal', py: 1 },
                            }}
                          />
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        )}
      </Stack>
      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        titleId="discover-place-title"
        title={selected?.name}
        actions={<Button onClick={() => setSelected(null)}>{t.close}</Button>}
      >
        <Stack spacing={4}>
          <Typography variant="labelLarge">{t.google}</Typography>
          {details && (
            <Typography variant="bodyMedium">{categoryText(details.category)}</Typography>
          )}
          {(result?.mode === 'demo' || selected?.demo) && (
            <Alert severity="info">
              {t.demo} · {t.demoNote}
            </Alert>
          )}
          {details && (
            <Typography>
              {statusText(details)} · {distanceText(details)}
              {details.rating != null
                ? ` · ★ ${new Intl.NumberFormat(locale).format(details.rating)}`
                : ''}
            </Typography>
          )}
          {link && (
            <Button
              component="a"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
            >
              {t.maps} · {t.liveLink}
            </Button>
          )}
        </Stack>
      </Sheet>
    </Box>
  )
}
