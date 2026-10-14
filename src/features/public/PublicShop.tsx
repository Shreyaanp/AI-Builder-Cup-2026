import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Clock, Leaf, MapPin, Phone, RefreshCw } from 'lucide-react'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'
import { formatPrice } from '../v1/format'
import { shape } from '../../design/theme'

interface PublicShopData {
  id: string
  name: string
  category: string
  location: string
  hours: string
  phone: string
  products: { name: string; price: number; unit: string; available: boolean }[]
}

/** English source; customer-page translations override keys (missing keys fall back). */
const en = {
  menu: 'Menu & prices',
  soldOut: 'Sold out',
  available: 'Available',
  directions: 'Directions',
  call: 'Call',
  refresh: 'Refresh',
  updated: 'Updated just now',
  missing: 'This shop page isn’t available.',
  missingBody: 'The owner may have stopped sharing it.',
  footer:
    'Prepared by the shop owner with Chalkboard · independent prototype, not a Google product',
  loading: 'Loading shop…',
  empty: 'The owner hasn’t added prices yet.',
  error: 'We couldn’t load this shop right now.',
  errorBody: 'Check your connection and try again.',
  retry: 'Try again',
  stale: 'Couldn’t refresh — showing the last menu we loaded.',
}

/** Native customer-page translations per locale (filled per language; English fallback). */
const publicTranslations: Partial<Record<Locale, Partial<typeof en>>> = {}

/** Customer-facing, read-only page for a shop the owner chose to share. No sign-in. */
export default function PublicShop({ id }: { id: string }) {
  const locale = useLocale()
  const t = { ...en, ...publicTranslations[locale] }
  const roles = useTheme().material
  const [shop, setShop] = useState<PublicShopData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  // Data shown may be older than the last attempt when a refresh failed (network/server).
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchShop = useCallback(
    (signal?: AbortSignal) =>
      fetch(`/api/v1/public/shops/${encodeURIComponent(id)}`, { signal }).then(async (response) => {
        // 404 = owner stopped sharing; anything else is a transient failure.
        if (response.status === 404) throw new Error('missing')
        if (!response.ok) throw new Error('error')
        return (await response.json()) as PublicShopData
      }),
    [id],
  )
  const apply = useCallback((data: PublicShopData) => {
    setShop(data)
    setStale(false)
    setState('ready')
  }, [])
  const failRefresh = useCallback((error: unknown) => {
    if (error instanceof Error && error.message === 'missing') {
      setShop(null)
      setState('missing')
    } else setStale(true)
  }, [])
  useEffect(() => {
    const abort = new AbortController()
    void fetchShop(abort.signal)
      .then((data) => {
        if (abort.signal.aborted) return
        setShop(data)
        setState('ready')
        document.title = `${data.name} · ${t.menu}`
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setState(error instanceof Error && error.message === 'missing' ? 'missing' : 'error')
      })
    // Customers returning to the tab see fresh availability.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchShop().then(apply).catch(failRefresh)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      abort.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchShop, t.menu, apply, failRefresh])

  if (state === 'loading')
    return (
      <Box role="status" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label={t.loading} />
      </Box>
    )
  if (state === 'error')
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', px: 3, pt: 12, textAlign: 'center' }}>
        <Typography component="h1" variant="headlineSmall">
          {t.error}
        </Typography>
        <Typography variant="bodyLarge" color="text.secondary">
          {t.errorBody}
        </Typography>
        <Button variant="contained" onClick={() => location.reload()} sx={{ alignSelf: 'center' }}>
          {t.retry}
        </Button>
      </Stack>
    )
  if (state === 'missing' || !shop)
    return (
      <Stack spacing={2} sx={{ maxWidth: 480, mx: 'auto', px: 3, pt: 12, textAlign: 'center' }}>
        <Typography component="h1" variant="headlineSmall">
          {t.missing}
        </Typography>
        <Typography variant="bodyLarge" color="text.secondary">
          {t.missingBody}
        </Typography>
      </Stack>
    )

  const facts: { icon: ReactNode; text: string }[] = [
    shop.hours && { icon: <Clock size={20} />, text: shop.hours },
    shop.location && { icon: <MapPin size={20} />, text: shop.location },
    shop.phone && { icon: <Phone size={20} />, text: shop.phone },
  ].filter(Boolean) as { icon: ReactNode; text: string }[]

  return (
    <Box
      component="main"
      sx={{
        maxWidth: 640,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        pt: 'calc(24px + env(safe-area-inset-top))',
        pb: 'calc(32px + env(safe-area-inset-bottom))',
      }}
    >
      <Box
        sx={{
          bgcolor: roles.primaryContainer,
          color: roles.onPrimaryContainer,
          borderRadius: `${shape.xl}px`,
          p: 3,
        }}
      >
        <Typography component="h1" variant="headlineMedium" sx={{ overflowWrap: 'anywhere' }}>
          {shop.name}
        </Typography>
        {shop.category && (
          <Typography variant="bodyLarge" sx={{ mt: 0.5 }}>
            {shop.category}
          </Typography>
        )}
        <Stack spacing={1} sx={{ mt: 2 }}>
          {facts.map((fact) => (
            <Stack key={fact.text} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box aria-hidden="true" sx={{ display: 'flex' }}>
                {fact.icon}
              </Box>
              <Typography variant="bodyMedium">{fact.text}</Typography>
            </Stack>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 2.5, flexWrap: 'wrap', gap: 1 }}>
          {shop.location && (
            <Button
              variant="contained"
              startIcon={<MapPin size={18} />}
              href={
                'https://www.google.com/maps/search/?api=1&query=' +
                encodeURIComponent(`${shop.name} ${shop.location}`)
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.directions}
            </Button>
          )}
          {shop.phone && (
            <Button
              variant="outlined"
              startIcon={<Phone size={18} />}
              href={`tel:${shop.phone.replace(/[^\d+]/g, '')}`}
              sx={{ borderColor: roles.onPrimaryContainer, color: roles.onPrimaryContainer }}
            >
              {t.call}
            </Button>
          )}
        </Stack>
      </Box>

      <Stack direction="row" sx={{ alignItems: 'center', mt: 4, mb: 1 }}>
        <Typography component="h2" variant="titleLarge" sx={{ flex: 1 }}>
          {t.menu}
        </Typography>
        <Button
          startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
          onClick={() => {
            setRefreshing(true)
            void fetchShop()
              .then(apply)
              .catch(failRefresh)
              .finally(() => setRefreshing(false))
          }}
        >
          {t.refresh}
        </Button>
      </Stack>
      {stale && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t.stale}
        </Alert>
      )}
      {shop.products.length === 0 ? (
        <Alert severity="info">{t.empty}</Alert>
      ) : (
        <List
          disablePadding
          sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px` }}
        >
          {shop.products.map((product, index) => (
            <Fragment key={product.name + product.unit}>
              {/* Sold-out rows use colour + strike-through + label, not opacity (contrast). */}
              <ListItem divider={index < shop.products.length - 1} sx={{ py: 1.5 }}>
                <ListItemText
                  primary={product.name}
                  secondary={product.available ? null : t.soldOut}
                  slotProps={{
                    primary: {
                      variant: 'bodyLarge',
                      sx: product.available ? undefined : { textDecoration: 'line-through' },
                    },
                    secondary: { variant: 'labelMedium', color: 'error' },
                  }}
                />
                <Typography variant="titleMedium" sx={{ whiteSpace: 'nowrap', ml: 2 }}>
                  {formatPrice(product.price)}
                  <Typography component="span" variant="bodyMedium" color="text.secondary">
                    {' '}
                    / {product.unit}
                  </Typography>
                </Typography>
              </ListItem>
            </Fragment>
          ))}
        </List>
      )}
      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 4, alignItems: 'center', color: 'text.secondary', justifyContent: 'center' }}
      >
        <Leaf size={14} aria-hidden="true" />
        <Typography variant="bodySmall" sx={{ textAlign: 'center' }}>
          {t.footer}
        </Typography>
      </Stack>
    </Box>
  )
}
