import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Alert, Box, Button, Chip, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import { BadgeCheck, Bookmark, PackageCheck, Sparkle, TrendingDown, TrendingUp } from 'lucide-react'
import type { Feed, ShopCard, Update } from './types'
import { customerNavigate } from '../frontdoors/navigation'
import { formatPrice } from '../v1/format'
import { useCustomer } from './account'
import { ShopAvatar } from './Chats'
import { useAccountCopy, timeAgo } from './copy'
import type { AccountCopy } from './copy'
import { SignInButton } from './SignIn'
import './customer.css'

/** Only the tapped card's photo morphs into the shop header (names must be unique). */
function openShop(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const image = event.currentTarget.querySelector<HTMLElement>('[data-shared]')
  if (image) image.style.viewTransitionName = `shop-${id.replace(/[^a-zA-Z0-9-]/g, '')}`
  customerNavigate(event)
}

function describe(
  update: Update,
  shop: ShopCard | undefined,
  t: AccountCopy,
): {
  icon: ReactNode
  title: string
  body: string
} {
  const currency = update.currency || shop?.currency || 'SGD'
  const price = update.price != null ? formatPrice(update.price, currency) : ''
  const unit = update.unit ? ` / ${update.unit}` : ''
  switch (update.kind) {
    case 'price_change': {
      const down =
        update.old_price != null && update.price != null && update.price < update.old_price
      return {
        icon: down ? <TrendingDown size={20} /> : <TrendingUp size={20} />,
        title: `${down ? t.priceDown : t.priceUp}: ${update.item}`,
        body: `${price}${unit}${
          update.old_price != null
            ? ` · ${t.was.replace('{price}', formatPrice(update.old_price, currency))}`
            : ''
        }`,
      }
    }
    case 'back_in_stock':
      return {
        icon: <PackageCheck size={20} />,
        title: `${t.backInStock}: ${update.item}`,
        body: `${price}${unit}`,
      }
    case 'new_item':
      return {
        icon: <Sparkle size={20} />,
        title: `${t.newItem}: ${update.item}`,
        body: `${price}${unit}`,
      }
    default:
      return { icon: <BadgeCheck size={20} />, title: t.menuConfirmed, body: t.menuConfirmedBody }
  }
}

const EMPTY: Feed = { shops: [], updates: [] }

/** Saved: followed shops plus their updates, generated from real changes to their pages. */
export function Saved() {
  const roles = useTheme().material
  const account = useCustomer()
  const t = useAccountCopy()
  const [loaded, setFeed] = useState<Feed | null>(null)
  const [failed, setFailed] = useState(false)
  // Bumped by Retry to fetch the feed again.
  const [attempt, setAttempt] = useState(0)
  const key = account.follows.join(',')
  useEffect(() => {
    document.title = `${t.savedTitle} · Chalkboard`
  }, [t])
  useEffect(() => {
    if (account.status === 'loading') return
    if (!key) return
    const abort = new AbortController()
    fetch(`/api/v1/public/updates?shops=${encodeURIComponent(key)}`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('feed')
        setFeed((await response.json()) as Feed)
        setFailed(false)
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true)
      })
    return () => abort.abort()
  }, [key, account.status, attempt])

  // No follows: nothing to fetch, an empty feed.
  const feed = key ? loaded : account.status === 'loading' ? null : EMPTY
  const shops = new Map(feed?.shops.map((shop) => [shop.id, shop]))
  return (
    <Box component="main" sx={{ maxWidth: 720, mx: 'auto', px: 2, pb: 14 }}>
      <Typography
        component="h1"
        variant="headlineMedium"
        sx={{ pt: 'calc(env(safe-area-inset-top) + 16px)', pb: 2, px: 1, fontWeight: 600 }}
      >
        {t.savedTitle}
      </Typography>
      {failed && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setFailed(false)
                setAttempt((n) => n + 1)
              }}
            >
              {t.retry}
            </Button>
          }
        >
          {t.feedFailed}
        </Alert>
      )}
      {!feed ? (
        // The follows stay saved; only the feed is missing, so no endless placeholders.
        failed ? null : (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={96} />
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={120} />
          </Stack>
        )
      ) : feed.shops.length === 0 ? (
        <Stack spacing={2} className="c-rise" sx={{ px: 1, pt: 4, textAlign: 'center' }}>
          <Box
            aria-hidden="true"
            sx={{
              mx: 'auto',
              width: 88,
              height: 88,
              borderRadius: '28px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: roles.secondaryContainer,
              color: roles.onSecondaryContainer,
            }}
          >
            <Bookmark size={40} />
          </Box>
          <Typography component="h2" variant="titleLarge">
            {t.noFollows}
          </Typography>
          <Typography color="text.secondary">{t.noFollowsBody}</Typography>
          <Button
            component="a"
            href="/explore/"
            onClick={customerNavigate}
            variant="contained"
            sx={{ alignSelf: 'center' }}
          >
            {t.findShops}
          </Button>
        </Stack>
      ) : (
        <>
          <Box component="section" aria-labelledby="following-title">
            <Typography id="following-title" component="h2" variant="titleMedium" sx={{ px: 1 }}>
              {t.followingTitle}
            </Typography>
            <Box
              component="ul"
              sx={{
                listStyle: 'none',
                m: 0,
                mt: 2,
                mx: -2,
                px: 2,
                pb: 1,
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              {feed.shops.map((shop, index) => (
                <li key={shop.id} className="c-rise" style={{ ['--i' as string]: index }}>
                  <Box
                    component="a"
                    href={`/explore/s/${encodeURIComponent(shop.id)}`}
                    onClick={(event: MouseEvent<HTMLAnchorElement>) => openShop(event, shop.id)}
                    className="c-press"
                    sx={{
                      width: 76,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1,
                      color: 'inherit',
                      textDecoration: 'none',
                      borderRadius: 2,
                      '&:focus-visible': { outline: `3px solid ${roles.primary}` },
                    }}
                  >
                    <Box
                      data-shared
                      sx={{
                        p: '3px',
                        borderRadius: '50%',
                        background: `conic-gradient(${roles.primary}, ${roles.tertiary}, ${roles.primary})`,
                      }}
                    >
                      <Box sx={{ p: '2px', borderRadius: '50%', bgcolor: roles.surface }}>
                        <ShopAvatar shop={shop} size={60} />
                      </Box>
                    </Box>
                    <Typography
                      variant="labelMedium"
                      sx={{ width: '100%', textAlign: 'center' }}
                      noWrap
                    >
                      {shop.name}
                    </Typography>
                  </Box>
                </li>
              ))}
            </Box>
          </Box>
          {account.status === 'signed-out' && (
            <Stack
              spacing={2}
              sx={{ mt: 2, p: 2, borderRadius: '20px', bgcolor: roles.surfaceContainerLow }}
            >
              <Typography variant="bodyMedium">{t.deviceOnly}</Typography>
              <SignInButton />
            </Stack>
          )}
          <Box component="section" aria-labelledby="updates-title" sx={{ mt: 4 }}>
            <Typography id="updates-title" component="h2" variant="titleMedium" sx={{ px: 1 }}>
              {t.updatesTitle}
            </Typography>
            {feed.updates.length === 0 ? (
              <Typography color="text.secondary" sx={{ px: 1, mt: 1 }}>
                {t.noUpdates}
              </Typography>
            ) : (
              <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, mt: 2, p: 0 }}>
                {feed.updates.map((update, index) => {
                  const shop = shops.get(update.shop_id)
                  const { icon, title, body } = describe(update, shop, t)
                  return (
                    <li
                      key={update.id}
                      className="c-rise"
                      style={{ ['--i' as string]: Math.min(index, 8) + 2 }}
                    >
                      <Box
                        component="a"
                        href={`/explore/s/${encodeURIComponent(update.shop_id)}`}
                        onClick={(event: MouseEvent<HTMLAnchorElement>) =>
                          openShop(event, update.shop_id)
                        }
                        className="c-press"
                        sx={{
                          display: 'flex',
                          gap: 2,
                          p: 2,
                          borderRadius: '24px',
                          color: 'inherit',
                          textDecoration: 'none',
                          bgcolor: roles.surfaceContainerLow,
                          border: `1px solid ${roles.outlineVariant}`,
                          '&:hover': { bgcolor: roles.surfaceContainer },
                          '&:focus-visible': {
                            outline: `3px solid ${roles.primary}`,
                            outlineOffset: 2,
                          },
                        }}
                      >
                        <Box data-shared sx={{ borderRadius: '16px', overflow: 'hidden' }}>
                          {shop && (
                            <Box
                              sx={{
                                width: 64,
                                height: 64,
                                borderRadius: '16px',
                                overflow: 'hidden',
                                '& > div': { borderRadius: 0, width: 64, height: 64 },
                              }}
                            >
                              <ShopAvatar shop={shop} size={64} />
                            </Box>
                          )}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography variant="labelLarge" noWrap sx={{ flex: 1 }}>
                              {shop?.name}
                            </Typography>
                            <Typography variant="labelSmall" color="text.secondary">
                              {timeAgo(update.created, t)}
                            </Typography>
                          </Stack>
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ mt: 1, alignItems: 'center', color: roles.primary }}
                          >
                            <Box aria-hidden="true" sx={{ display: 'grid' }}>
                              {icon}
                            </Box>
                            <Typography
                              variant="titleSmall"
                              sx={{ color: roles.onSurface, fontWeight: 600 }}
                            >
                              {title}
                            </Typography>
                          </Stack>
                          <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 0.25 }}>
                            {body}
                          </Typography>
                          {update.demo && (
                            <Chip
                              label={t.demoUpdate}
                              size="small"
                              sx={{
                                mt: 1,
                                height: 22,
                                bgcolor: roles.tertiaryContainer,
                                color: roles.onTertiaryContainer,
                              }}
                            />
                          )}
                        </Box>
                      </Box>
                    </li>
                  )
                })}
              </Stack>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
