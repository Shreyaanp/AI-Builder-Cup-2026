import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { Camera, ExternalLink, Share2, Sparkles, Store } from 'lucide-react'
import { gsap } from 'gsap'
import { hits, useChalkTimeline } from '../../design/chalkMotion'
import { HAND_FONT, shape } from '../../design/theme'
import { tourCopy } from '../tour/strings'
import { startDemoTour } from '../tour/tourActions'
import { useLocale } from '../../state/hooks'
import { useCopy } from './strings'
import { useNewShopCopy } from './newShopCopy'
import { useWorkspace } from './workspaceContext'
import { ShopSheets } from './ShopTiles'
import { MapsHandoff } from './MapsHandoff'
import { onMenu } from '../shop/stock'
import { ShopQr } from './ShopQr'
import { FirstCustomers } from './FirstCustomers'
import { useGoLiveCopy } from './goLiveCopy'

/** The "Your shop is ready" moment that ends the new-shop flow (full screen, no dialog). */
export function NewShopReady({ preview = false }: { preview?: boolean }) {
  const ws = useWorkspace()
  const t = useCopy()
  const f = useNewShopCopy()
  const g = useGoLiveCopy()
  const tour = tourCopy(useLocale())
  const roles = useTheme().material
  const root = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const name = ws.active?.fields.name ?? ''
  const link = ws.active?.public && ws.shareUrl ? new URL(ws.shareUrl, location.origin).href : null
  useChalkTimeline(root, (root) => {
    if (preview) return
    const shop = hits(root, '[data-ready-shop]')
    const sparks = hits(root, '[data-chalk-spark]')
    if (shop.length)
      gsap.from(shop, {
        scale: 1.3,
        rotate: -8,
        opacity: 0,
        duration: 0.6,
        ease: 'back.out(1.5)',
      })
    if (sparks.length) gsap.from(sparks, { scale: 0.3, opacity: 0, duration: 0.5, stagger: 0.12 })
  })
  useEffect(() => {
    if (!preview) title.current?.focus()
  }, [preview])
  return (
    <Box
      ref={root}
      sx={{
        width: '100%',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        maxWidth: 780,
        mx: 'auto',
        textAlign: 'center',
        pt: { xs: 4, md: 8 },
        pb: 'calc(112px + env(safe-area-inset-bottom))',
        px: 4,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          color: roles.primary,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 3,
          mb: 4,
        }}
      >
        <Sparkles data-chalk-spark size={28} />
        <Store data-ready-shop size={88} strokeWidth={1.3} />
        <Sparkles data-chalk-spark size={32} />
      </Box>
      <Typography
        ref={title}
        tabIndex={-1}
        component="h1"
        variant="headlineMedium"
        sx={{
          fontFamily: HAND_FONT,
          // Caveat has tall ascenders: a tight line height made wrapped lines touch (OB-112).
          lineHeight: 1.3,
          '&:focus': { outline: 'none' },
        }}
      >
        {ws.active?.public ? g.congrats(name) : `${name} · ${f.ready}`}
      </Typography>
      <Typography
        variant="bodyLarge"
        color="text.secondary"
        sx={{ mt: 2, maxWidth: 460, mx: 'auto' }}
      >
        {t.newShopReadyBody}
      </Typography>
      <Box component="details" sx={{ mt: 3 }}>
        <Box
          component="summary"
          sx={{
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: roles.primary,
            border: `1px solid ${roles.outline}`,
            borderRadius: `${shape.full}px`,
            typography: 'labelLarge',
            '&:focus-visible': { outline: `2px solid ${roles.primary}`, outlineOffset: 2 },
          }}
        >
          <Share2 size={20} aria-hidden="true" style={{ marginInlineEnd: 8 }} />
          {g.share}
        </Box>
        {link && (
          <Stack data-testid="shop-link" sx={{ mt: 4, gap: 3, alignItems: 'center' }}>
            <Typography
              component="a"
              href={link}
              target="_blank"
              rel="noreferrer"
              variant="bodyMedium"
              aria-label={g.yourLink}
              sx={{
                px: 4,
                py: 3,
                borderRadius: `${shape.sm}px`,
                bgcolor: roles.surfaceContainerHighest,
                overflowWrap: 'anywhere',
              }}
            >
              {g.yourLink}
            </Typography>
            <Box
              data-testid="shop-qr"
              sx={{
                '& .shop-qr-name': { typography: 'headlineMedium' },
                '& .shop-qr-caption': { typography: 'bodyLarge' },
              }}
            >
              <ShopQr url={link} name={name} />
            </Box>
            <FirstCustomers url={link} name={name} />
          </Stack>
        )}
        <Stack
          sx={{
            mt: 6,
            p: 3,
            gap: 2,
            bgcolor: roles.surfaceContainer,
            borderRadius: `${shape.lg}px`,
            textAlign: 'start',
          }}
        >
          {link && (
            <Button
              variant="outlined"
              component="a"
              href={link}
              target="_blank"
              rel="noreferrer"
              startIcon={<ExternalLink size={22} />}
            >
              {g.openShop}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<Share2 size={22} />}
            onClick={() => setSharing(true)}
          >
            {g.share}
          </Button>
          <Typography component="h2" variant="titleSmall" color="text.secondary">
            {g.nextTitle}
          </Typography>
          <Button
            onClick={() => {
              ws.dismissNewShopReady()
              ws.go('shop')
            }}
          >
            {g.addMenu}
          </Button>
          <Button
            onClick={() => {
              ws.dismissNewShopReady()
              ws.go('grow')
            }}
          >
            {g.setUpStamps}
          </Button>
          <Button
            variant="outlined"
            startIcon={<Camera size={22} />}
            onClick={() => {
              ws.dismissNewShopReady()
              ws.requestPhoto()
            }}
          >
            {f.photos}
          </Button>
          <Button
            disabled={busy}
            startIcon={<Sparkles size={22} />}
            onClick={() => void startDemoTour(ws, setBusy, setFailed)}
          >
            {busy ? tour.preparing : f.tour}
          </Button>
          {failed && <Alert severity="error">{tour.failed}</Alert>}
        </Stack>
        {ws.active && (
          <Box sx={{ mt: 3 }}>
            {/* Only what customers can buy: Google's public form never gets tea dust (OB-310). */}
            <MapsHandoff fields={ws.active.fields} products={ws.products.filter(onMenu)} />
          </Box>
        )}
      </Box>
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          px: 4,
          pt: 2,
          pb: 'calc(16px + env(safe-area-inset-bottom))',
          bgcolor: roles.surface,
          zIndex: 2,
        }}
      >
        <Button
          variant="contained"
          fullWidth
          sx={{ minHeight: 56, maxWidth: 716 }}
          onClick={ws.dismissNewShopReady}
        >
          {t.newShopContinue}
        </Button>
      </Box>
      <ShopSheets kind={sharing ? 'customer' : null} onClose={() => setSharing(false)} />
    </Box>
  )
}
