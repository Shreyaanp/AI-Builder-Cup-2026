import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { Camera, Share2, Sparkles, Store } from 'lucide-react'
import { gsap } from 'gsap'
import { useChalkTimeline } from '../../design/chalkMotion'
import { HAND_FONT, shape } from '../../design/theme'
import { tourCopy } from '../tour/strings'
import { startDemoTour } from '../tour/tourActions'
import { useLocale } from '../../state/hooks'
import { useCopy } from './strings'
import { useNewShopCopy } from './newShopCopy'
import { useWorkspace } from './workspaceContext'
import { ShopSheets } from './ShopTiles'

/** The "Your shop is ready" moment that ends the new-shop flow (full screen, no dialog). */
export function NewShopReady() {
  const ws = useWorkspace()
  const t = useCopy()
  const f = useNewShopCopy()
  const tour = tourCopy(useLocale())
  const roles = useTheme().material
  const root = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useChalkTimeline(root, () => {
    gsap.from('[data-ready-shop]', { scale: 1.3, rotate: -8, opacity: 0, duration: 0.6, ease: 'back.out(1.5)' })
    gsap.from('[data-chalk-spark]', { scale: 0.3, opacity: 0, duration: 0.5, stagger: 0.12 })
  })
  useEffect(() => { title.current?.focus() }, [])
  return (
    <Box ref={root} sx={{ width: '100%', maxWidth: 780, mx: 'auto', textAlign: 'center', py: { xs: 8, md: 14 }, px: 4 }}>
      <Box aria-hidden="true" sx={{ color: roles.primary, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, mb: 4 }}>
        <Sparkles data-chalk-spark size={28} /><Store data-ready-shop size={88} strokeWidth={1.3} /><Sparkles data-chalk-spark size={32} />
      </Box>
      <Typography ref={title} tabIndex={-1} component="h1" variant="displaySmall" sx={{ fontFamily: HAND_FONT, fontSize: { xs: '3rem', md: '4rem' }, '&:focus': { outline: 'none' } }}>{f.ready}</Typography>
      <Typography variant="headlineSmall" sx={{ mt: 3, overflowWrap: 'anywhere' }}>{ws.active?.fields.name}</Typography>
      <Typography variant="bodyLarge" color="text.secondary" sx={{ mt: 2, maxWidth: 460, mx: 'auto' }}>{t.newShopReadyBody}</Typography>
      <Stack sx={{ mt: 6, p: 3, gap: 2, bgcolor: roles.surfaceContainer, borderRadius: `${shape.lg}px`, textAlign: 'start' }}>
        <Button variant="contained" startIcon={<Share2 size={22} />} onClick={() => setSharing(true)}>{t.share}</Button>
        <Button variant="outlined" startIcon={<Camera size={22} />} onClick={() => { ws.dismissNewShopReady(); ws.requestPhoto() }}>{f.photos}</Button>
        <Button disabled={busy} startIcon={<Sparkles size={22} />} onClick={() => void startDemoTour(ws, setBusy, setFailed)}>{busy ? tour.preparing : f.tour}</Button>
        {failed && <Alert severity="error">{tour.failed}</Alert>}
      </Stack>
      <Button sx={{ mt: 3 }} onClick={ws.dismissNewShopReady}>{t.newShopContinue}</Button>
      <ShopSheets kind={sharing ? 'customer' : null} onClose={() => setSharing(false)} />
    </Box>
  )
}
