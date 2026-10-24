import { useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Alert, Box, Button, Chip, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import { BadgeCheck, Bookmark, PackageCheck, Sparkle, TrendingDown, TrendingUp } from 'lucide-react'
import type { Feed, ShopCard, Update } from './types'
import { customerNavigate } from '../frontdoors/navigation'
import { formatPrice } from '../v1/format'
import { useCustomer } from './account'
import { useAccountCopy, timeAgo } from './copy'
import type { AccountCopy } from './copy'
import { SignInButton } from './SignIn'
import { FollowButton } from './FollowButton'
import { CollectionEmptyState, CollectionPage } from './CollectionEmptyState'
import './customer.css'

/** Only the tapped card's photo morphs into the shop header (names must be unique). */
function openShop(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const scope = event.currentTarget.closest('li') ?? event.currentTarget
  const image = scope.querySelector<HTMLElement>('[data-shared]')
  if (image) image.style.viewTransitionName = `shop-${id.replace(/[^a-zA-Z0-9-]/g, '')}`
  customerNavigate(event)
}

/**
 * A followed shop as a card (A-31): the whole name (it wraps, never "Lantern …") and a visible
 * Following button that unfollows. No photo: the heatmap budget for this view is spent on the
 * name and the button. The name is the link; its hit area is the
 * card, and the button sits above it.
 */
function FollowedShop({ shop, index }: { shop: ShopCard; index: number }) {
  const roles = useTheme().material
  return (
    <li className="c-rise" style={{ ['--i' as string]: index }}>
      <Box
        className="c-press"
        sx={{
          position: 'relative',
          display: 'flex',
          gap: 3,
          alignItems: 'center',
          p: 3,
          borderRadius: '24px',
          bgcolor: roles.surfaceContainerLow,
          border: `1px solid ${roles.outlineVariant}`,
          '&:hover': { bgcolor: roles.surfaceContainer },
          '&:has(a:focus-visible)': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="a"
            variant="titleMedium"
            href={`/explore/s/${encodeURIComponent(shop.id)}`}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => openShop(event, shop.id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              minHeight: 48,
              color: 'inherit',
              textDecoration: 'none',
              overflowWrap: 'anywhere',
              '&:focus-visible': { outline: 'none' },
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
              },
            }}
          >
            {shop.name}
          </Typography>
          <Box sx={{ position: 'relative', zIndex: 1, mt: 2 }}>
            <FollowButton id={shop.id} name={shop.name} icon={false} />
          </Box>
        </Box>
      </Box>
    </li>
  )
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
  const currency = update.currency || shop?.currency || shopRegion(shop).currency
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
import { shopRegion } from '../../region/region'
export function Saved() {
  const roles = useTheme().material
  const account = useCustomer()
  const t = useAccountCopy()
  const [loaded, setFeed] = useState<Feed | null>(null)
  const [failed, setFailed] = useState(false)
  // Bumped by Retry to fetch the feed again.
  const [attempt, setAttempt] = useState(0)
  const [showAllUpdates, setShowAllUpdates] = useState(false)
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
  // OB-158: lead with the latest news; older updates are one tap away.
  const updates = feed ? (showAllUpdates ? feed.updates : feed.updates.slice(0, 1)) : []
  return (
    <CollectionPage title={t.savedTitle}>
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
        <CollectionEmptyState
          title={t.noFollows}
          body={t.noFollowsBody}
          icon={<Bookmark size={40} />}
        />
      ) : (
        <>
          <Box component="section" aria-labelledby="following-title">
            <Typography id="following-title" component="h2" variant="titleMedium" sx={{ px: 2 }}>
              {t.followingTitle}
            </Typography>
            <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, mt: 2, p: 0 }}>
              {feed.shops.map((shop, index) => (
                <FollowedShop key={shop.id} shop={shop} index={index} />
              ))}
            </Stack>
          </Box>
          <Box component="section" aria-labelledby="updates-title" sx={{ mt: 4 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography id="updates-title" component="h2" variant="titleMedium" sx={{ px: 2 }}>
                {t.updatesTitle}
              </Typography>
              {feed.updates.length > 1 && (
                <Button
                  variant="text"
                  aria-expanded={showAllUpdates}
                  aria-controls="saved-updates"
                  onClick={() => setShowAllUpdates((shown) => !shown)}
                >
                  {showAllUpdates ? t.showLessUpdates : t.showAllUpdates}
                </Button>
              )}
            </Stack>
            {feed.updates.length === 0 ? (
              <Typography color="text.secondary" sx={{ px: 2, mt: 1 }}>
                {t.noUpdates}
              </Typography>
            ) : (
              <Stack
                id="saved-updates"
                component="ul"
                spacing={2}
                sx={{ listStyle: 'none', m: 0, mt: 2, p: 0 }}
              >
                {updates.map((update, index) => {
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
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography variant="labelLarge" noWrap sx={{ flex: 1 }}>
                              {shop?.name}
                            </Typography>
                            <Typography variant="bodySmall" color="text.secondary">
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
                          <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
                            {body}
                          </Typography>
                          {update.demo && (
                            <Chip
                              label={t.demoUpdate}
                              size="small"
                              sx={{
                                mt: 1,
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
          {account.status === 'signed-out' && (
            // The one filled button sits at the bottom, above the navigation, in thumb reach (A-43).
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                pt: 4,
              }}
            >
              <Stack
                spacing={2}
                sx={{ p: 4, borderRadius: '20px', bgcolor: roles.surfaceContainerLow }}
              >
                <Typography variant="bodyMedium">{t.deviceOnly}</Typography>
                <SignInButton />
              </Stack>
            </Box>
          )}
        </>
      )}
    </CollectionPage>
  )
}
