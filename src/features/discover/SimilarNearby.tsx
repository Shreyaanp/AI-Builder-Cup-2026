import { useEffect, useState } from 'react'
import { Box, Button, Skeleton, Typography, useTheme } from '@mui/material'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { customerNavigate } from '../frontdoors/navigation'
import { PlaceImage } from '../frontdoors/PlaceImage'
import { formatPrice } from '../v1/format'
import { askCopy } from './askStrings'
import { useSearchCopy } from './searchCopy'

type Similar = components['schemas']['SimilarResponse']

function distanceText(metres: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: metres < 1000 ? 'meter' : 'kilometer',
    maximumFractionDigits: metres < 1000 ? 0 : 1,
  }).format(metres < 1000 ? Math.round(metres / 10) * 10 : metres / 1000)
}

/**
 * "Similar nearby" on a shop page: shops alike in meaning, close to this one (the shared search
 * engine). The chips switch between this shop and one of its items ("like the banana bread").
 */
export function SimilarNearby({ shop, items }: { shop: string; items: string[] }) {
  const roles = useTheme().material
  const locale = useLocale()
  const copy = useSearchCopy()
  const ask = askCopy(locale)
  const [item, setItem] = useState('')
  const [result, setResult] = useState<{ key: string; data: Similar | null } | null>(null)
  const key = `${shop}\0${item}`
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ shop })
    if (item) params.set('item', item)
    fetch(`/api/v1/discover/similar?${params}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<Similar>) : null))
      .then((data) => setResult({ key, data }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, data: null })
      })
    return () => controller.abort()
  }, [shop, item, key])
  const loading = result?.key !== key
  const places = result?.data?.places ?? []
  // A secondary section: when the lookup fails it simply stays out of the way.
  if (!loading && result?.data == null) return null
  if (!loading && !item && places.length === 0) return null
  const choices = ['', ...items.slice(0, 3)]
  return (
    <Box
      component="section"
      aria-labelledby="similar-nearby"
      data-testid="similar-nearby"
      sx={{ mt: 6 }}
    >
      <Typography id="similar-nearby" variant="titleMedium" component="h2">
        {copy.similarTitle}
      </Typography>
      <Box
        role="group"
        aria-label={copy.similarTitle}
        sx={{ display: 'flex', gap: 2, mt: 2, overflowX: 'auto', pb: 1, scrollbarWidth: 'none' }}
      >
        {choices.map((choice) => (
          <Button
            key={choice || 'shop'}
            variant={choice === item ? 'contained' : 'outlined'}
            aria-pressed={choice === item}
            onClick={() => setItem(choice)}
            sx={{ minHeight: 48, borderRadius: 999, px: 4, flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            {choice || copy.likeThisShop}
          </Button>
        ))}
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', gap: 3, mt: 3 }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="rounded" width={200} height={168} sx={{ flexShrink: 0 }} />
          ))}
        </Box>
      ) : places.length === 0 ? (
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 3 }}>
          {copy.similarNone}
        </Typography>
      ) : (
        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            mt: 3,
            display: 'grid',
            gridAutoFlow: 'column',
            gridAutoColumns: 'minmax(200px, 46%)',
            gap: 3,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            pb: 2,
          }}
        >
          {places.map((place) => (
            <Box component="li" key={place.id} sx={{ scrollSnapAlign: 'start', minWidth: 0 }}>
              <Box
                component="a"
                href={`/explore/s/${encodeURIComponent(place.id)}`}
                onClick={customerNavigate}
                sx={{
                  display: 'block',
                  height: '100%',
                  color: 'inherit',
                  textDecoration: 'none',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  bgcolor: roles.surfaceContainerLow,
                  border: `1px solid ${roles.outlineVariant}`,
                  '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
                }}
              >
                <Box sx={{ aspectRatio: '16 / 9', overflow: 'hidden' }}>
                  <PlaceImage
                    id={place.id}
                    category={place.category}
                    photo={place.photo_url}
                    compact
                  />
                </Box>
                <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="titleSmall" component="h3" noWrap>
                    {place.name}
                  </Typography>
                  <Typography variant="bodySmall" noWrap>
                    {place.item
                      ? `${place.item.name} · ${formatPrice(place.item.price, place.currency)}`
                      : place.category}
                  </Typography>
                  <Typography variant="bodySmall" color="text.secondary" noWrap>
                    {[
                      distanceText(place.distance_m, locale),
                      place.open_now === null ? null : place.open_now ? ask.openNow : ask.closed,
                      place.demo_shop ? ask.demo : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
