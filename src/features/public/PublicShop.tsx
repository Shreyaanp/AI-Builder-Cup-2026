import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
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
import { usePreferences } from '../../state/hooks'
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

const copy = {
  en: {
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
      'Prepared by the shop owner with oGoogle AI · independent prototype, not a Google product',
    loading: 'Loading shop…',
    empty: 'The owner hasn’t added prices yet.',
  },
  hi: {
    menu: 'मेनू और दाम',
    soldOut: 'खत्म',
    available: 'उपलब्ध',
    directions: 'रास्ता',
    call: 'कॉल करें',
    refresh: 'ताज़ा करें',
    updated: 'अभी अपडेट हुआ',
    missing: 'यह दुकान पेज उपलब्ध नहीं है।',
    missingBody: 'हो सकता है मालिक ने इसे साझा करना बंद कर दिया हो।',
    footer: 'दुकान मालिक द्वारा oGoogle AI से तैयार · स्वतंत्र प्रोटोटाइप, Google का उत्पाद नहीं',
    loading: 'दुकान लोड हो रही है…',
    empty: 'मालिक ने अभी दाम नहीं जोड़े हैं।',
  },
}

/** Customer-facing, read-only page for a shop the owner chose to share. No sign-in. */
export default function PublicShop({ id }: { id: string }) {
  const { language } = usePreferences()
  const t = copy[language]
  const roles = useTheme().material
  const [shop, setShop] = useState<PublicShopData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [refreshing, setRefreshing] = useState(false)

  const fetchShop = useCallback(
    (signal?: AbortSignal) =>
      fetch(`/api/v1/public/shops/${encodeURIComponent(id)}`, { signal }).then(async (response) => {
        if (!response.ok) throw new Error('missing')
        return (await response.json()) as PublicShopData
      }),
    [id],
  )
  useEffect(() => {
    const abort = new AbortController()
    void fetchShop(abort.signal)
      .then((data) => {
        if (abort.signal.aborted) return
        setShop(data)
        setState('ready')
        document.title = `${data.name} · ${t.menu}`
      })
      .catch(() => {
        if (!abort.signal.aborted) setState('missing')
      })
    // Customers returning to the tab see fresh availability.
    const onVisible = () => {
      if (document.visibilityState === 'visible')
        void fetchShop()
          .then(setShop)
          .catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      abort.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchShop, t.menu])

  if (state === 'loading')
    return (
      <Box role="status" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label={t.loading} />
      </Box>
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
          <Typography variant="bodyLarge" sx={{ mt: 0.5, opacity: 0.85 }}>
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
              .then(setShop)
              .catch(() => setState('missing'))
              .finally(() => setRefreshing(false))
          }}
        >
          {t.refresh}
        </Button>
      </Stack>
      {shop.products.length === 0 ? (
        <Alert severity="info">{t.empty}</Alert>
      ) : (
        <List
          disablePadding
          sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px` }}
        >
          {shop.products.map((product, index) => (
            <Fragment key={product.name + product.unit}>
              {index > 0 && <Divider component="li" />}
              <ListItem sx={{ py: 1.5, opacity: product.available ? 1 : 0.6 }}>
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
