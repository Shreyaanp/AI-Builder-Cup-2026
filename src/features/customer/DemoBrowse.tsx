import { useEffect, useState, type ReactNode } from 'react'
import { Box, Button, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { useDemoCopy } from '../frontdoors/strings'
import { PlaceImage } from '../frontdoors/PlaceImage'
import { customerNavigate } from '../frontdoors/navigation'
import { usePassportCopy } from '../passport/copy'
import { formatPrice } from '../v1/format'
import type { Api } from '../v1/api'
import { formatDistance } from '../discover/formatDistance'

type DemoShop = { id: string; name: string }
type ShopDetails = {
  category: string
  gallery?: string[]
  products: { name: string; price: number }[]
  currency: string
}

export function DemoBrowse({
  shops,
  api,
  actions,
}: {
  shops: DemoShop[]
  api: Api
  /** Language and theme controls, beside the title (not a band of their own in the banner). */
  actions?: ReactNode
}) {
  const demo = useDemoCopy()
  const passport = usePassportCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const [details, setDetails] = useState<Record<string, ShopDetails>>({})

  useEffect(() => {
    let live = true
    void Promise.all(
      shops.map(async (shop) => {
        try {
          const value = await api<ShopDetails>(`/public/shops/${shop.id}`)
          return [shop.id, value] as const
        } catch {
          return null
        }
      }),
    ).then((rows) => {
      if (live) setDetails(Object.fromEntries(rows.filter((row) => row !== null)))
    })
    return () => {
      live = false
    }
  }, [api, shops])

  return (
    <Box component="main" sx={{ maxWidth: 760, mx: 'auto', p: 2, pb: 4 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography component="h1" variant="headlineSmall">
          {demo.customer}
        </Typography>
        {actions && <Stack direction="row">{actions}</Stack>}
      </Stack>
      <Stack
        component="ol"
        direction="row"
        aria-label={`${demo.customer}: ${passport.stampBook}, ${passport.nav}`}
        sx={{ listStyle: 'none', m: 0, mb: 3, p: 0, gap: 1 }}
      >
        {[demo.customer, demo.guideStamp, demo.guidePassport].map((label, index) => (
          <Box component="li" key={`${index}-${label}`} sx={{ flex: 1, minWidth: 0 }}>
            <Box
              component={index > 0 ? 'a' : 'span'}
              href={
                index === 1
                  ? '/explore/s/demo-story-bengaluru-chai?source=qr'
                  : index === 2
                    ? '/explore/passport'
                    : undefined
              }
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 48,
                color: index > 0 ? 'primary.main' : 'text.secondary',
                typography: 'labelSmall',
                textDecoration: index > 0 ? 'underline' : 'none',
                textUnderlineOffset: 3,
              }}
            >
              <Box
                component="span"
                sx={{
                  width: 24,
                  height: 24,
                  flex: '0 0 24px',
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: '50%',
                  bgcolor: roles.secondaryContainer,
                  color: roles.onSecondaryContainer,
                }}
              >
                {index + 1}
              </Box>
              <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {label}
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
      <Stack
        component="ul"
        aria-label={demo.customer}
        sx={{ listStyle: 'none', m: 0, p: 0, gap: 2 }}
      >
        {shops.map((shop, index) => {
          const info = details[shop.id]
          const image = info?.gallery?.[0]
          const photo = image ? `/api/v1/public/shops/${shop.id}/photos/${image}.jpg` : null
          return (
            <Box component="li" key={shop.id}>
              <Button
                component="a"
                href={`/explore/demo/${shop.id}`}
                onClick={customerNavigate}
                aria-label={info ? `${shop.name}, ${info.category}` : shop.name}
                sx={{
                  display: 'flex',
                  // A row per shop: a thumbnail and its lines, so several shops fit one screen (OB-124).
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  p: 0,
                  overflow: 'hidden',
                  borderRadius: 3,
                  border: `1px solid ${roles.outlineVariant}`,
                  bgcolor: roles.surfaceContainerLow,
                  color: 'text.primary',
                  textAlign: 'left',
                  textTransform: 'none',
                  '&:hover': { bgcolor: roles.surfaceContainer },
                  '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
                }}
              >
                {info ? (
                  <Box sx={{ width: 96, flex: '0 0 96px', overflow: 'hidden' }}>
                    <PlaceImage
                      id={shop.id}
                      category={info.category}
                      photo={photo}
                      compact
                      eager={index === 0}
                    />
                  </Box>
                ) : (
                  <Skeleton
                    variant="rectangular"
                    width={96}
                    height={96}
                    sx={{ flex: '0 0 96px' }}
                  />
                )}
                <Stack spacing={0.5} sx={{ p: 2, flex: 1, minWidth: 0, justifyContent: 'center' }}>
                  <Typography
                    variant="titleMedium"
                    component="span"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {shop.name}
                  </Typography>
                  {info ? (
                    <Stack
                      direction="row"
                      sx={{ gap: 1, flexWrap: 'wrap', color: 'text.secondary' }}
                    >
                      <Typography variant="bodySmall" component="span">
                        {info.category}
                      </Typography>
                      <Typography variant="bodySmall" component="span" aria-hidden="true">
                        ·
                      </Typography>
                      <Typography variant="bodySmall" component="span">
                        {info.products[0]
                          ? formatPrice(info.products[0].price, info.currency, locale)
                          : passport.demo}
                      </Typography>
                      <Typography variant="bodySmall" component="span" aria-hidden="true">
                        ·
                      </Typography>
                      <Typography variant="bodySmall" component="span">
                        {formatDistance(350 + index * 250, locale)}
                      </Typography>
                    </Stack>
                  ) : (
                    <Skeleton width="65%" />
                  )}
                </Stack>
              </Button>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
