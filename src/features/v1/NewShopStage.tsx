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
  const link = ws.shareUrl ? new URL(ws.shareUrl, location.origin).href : null
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
        maxWidth: 780,
        mx: 'auto',
        textAlign: 'center',
        py: { xs: 8, md: 14 },
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
        variant="displaySmall"
        sx={{
          fontFamily: HAND_FONT,
          fontSize: { xs: '3rem', md: '4rem' },
          // Caveat has tall ascenders: a tight line height made wrapped lines touch (OB-112).
          lineHeight: 1.3,
          '&:focus': { outline: 'none' },
        }}
      >
        {g.congrats(name)}
      </Typography>
      <Typography
        variant="bodyLarge"
        color="text.secondary"
        sx={{ mt: 2, maxWidth: 460, mx: 'auto' }}
      >
        {t.newShopReadyBody}
      </Typography>
      {link && (
        <Stack data-testid="shop-link" sx={{ mt: 4, gap: 3, alignItems: 'center' }}>
          <Typography
            variant="bodyMedium"
            aria-label={g.yourLink}
            sx={{
              px: 4,
              py: 3,
              borderRadius: `${shape.sm}px`,
              bgcolor: roles.surfaceContainerHighest,
              overflowWrap: 'anywhere',
              fontFamily: 'monospace',
            }}
          >
            {link}
          </Typography>
          <Box data-testid="shop-qr">
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
            variant="contained"
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
          <MapsHandoff fields={ws.active.fields} products={ws.products} />
        </Box>
      )}
      <Button sx={{ mt: 3 }} onClick={ws.dismissNewShopReady}>
        {t.newShopContinue}
      </Button>
      <ShopSheets kind={sharing ? 'customer' : null} onClose={() => setSharing(false)} />
    </Box>
  )
}
