import { useEffect, useState, type ReactNode } from 'react'
import { Box, Button, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { useDemoCopy } from '../frontdoors/strings'
import { PlaceImage } from '../frontdoors/PlaceImage'
import { customerNavigate } from '../frontdoors/navigation'
import { usePassportCopy } from '../passport/copy'
import { formatShopPrice } from '../v1/format'
import { plainShopName } from '../discover/sampleShop'
import type { Api } from '../v1/api'
import { formatDistance } from '../discover/formatDistance'

type DemoShop = { id: string; name: string }
type ShopDetails = {
  category: string
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
  const [settled, setSettled] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    let live = true
    void Promise.all(
      shops.map(async (shop) => {
        try {
          const value = await api<ShopDetails>(`/public/shops/${shop.id}`)
          if (live) {
            setDetails((current) => ({ ...current, [shop.id]: value }))
            setSettled((current) => new Set(current).add(shop.id))
          }
        } catch {
          if (live) setSettled((current) => new Set(current).add(shop.id))
        }
      }),
    )
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
        data-testid="demo-steps"
      >
        {[demo.customer, demo.guideStamp, demo.guidePassport].map((label, index) => (
          <Box component="li" key={`${index}-${label}`} sx={{ flex: 1, minWidth: 0 }}>
            <Box
              component={index > 0 ? 'a' : 'span'}
              href={
                index === 1
                  ? '/explore/s/demo-story-bengaluru-chai?source=qr'
                  : index === 2
                    ? '/explore/passport?source=demo'
                    : undefined
              }
              sx={{
                // The number sits above its words: beside them, a third of a phone is too narrow
                // and "Collect a stamp" broke as "Collect a / stamp".
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                minHeight: 48,
                py: 0.5,
                textAlign: 'center',
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
              <Box component="span" sx={{ minWidth: 0, textWrap: 'balance' }}>
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
          // The bundled picture is a menu screenshot with its own price text; sample shops show
          // their category art instead (as on the shop page).
          const name = plainShopName(shop.name)
          return (
            <Box component="li" key={shop.id}>
              <Button
                component="a"
                href={`/explore/demo/${shop.id}`}
                onClick={customerNavigate}
                aria-label={info ? `${name}, ${info.category}` : name}
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
                    <PlaceImage id={shop.id} category={info.category} compact eager={index === 0} />
                  </Box>
                ) : settled.has(shop.id) ? (
                  <Box sx={{ width: '100%', aspectRatio: '16 / 9', overflow: 'hidden' }}>
                    <PlaceImage id={shop.id} category="Shop" compact eager={index === 0} />
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
                    {name}
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
                          ? formatShopPrice(info.products[0].price, info.currency, locale)
                          : passport.demo}
                      </Typography>
                      <Typography variant="bodySmall" component="span" aria-hidden="true">
                        ·
                      </Typography>
                      <Typography variant="bodySmall" component="span">
                        {formatDistance(350 + index * 250, locale)}
                      </Typography>
                    </Stack>
                  ) : settled.has(shop.id) ? (
                    <Typography variant="bodySmall" component="span" color="text.secondary">
                      {passport.demo}
                    </Typography>
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
