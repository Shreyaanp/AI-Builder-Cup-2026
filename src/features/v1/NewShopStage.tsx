import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { ArrowLeft, Camera, Check, Share2, Sparkles, Store } from 'lucide-react'
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

/** An in-page stage: no modal, scrim or focus trap. */
export function NewShopNavigation() {
  const ws = useWorkspace()
  const t = useCopy()
  const flow = useNewShopCopy()
  const step = ws.newShopStep
  return (
    <>
      <Button startIcon={<ArrowLeft size={20} />} onClick={() => {
        if (step > 1) window.history.back()
        else ws.cancelNewShop()
      }}>{flow.back}</Button>
      <Typography component="h2" variant="labelLarge" sx={{ flex: 1 }}>{t.newShopMode}</Typography>
      <Button onClick={ws.cancelNewShop}>{t.cancel}</Button>
    </>
  )
}

export function NewShopHeading() {
  const ws = useWorkspace()
  const t = useCopy()
  const f = useNewShopCopy()
  const roles = useTheme().material
  const root = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useChalkTimeline(root, () => {
    gsap.from('[data-chalk-title]', { opacity: 0, y: 12, duration: 0.6 })
    gsap.from('[data-chalk-shop]', { opacity: 0, rotate: -6, scale: 0.9, duration: 0.65 })
  })
  useEffect(() => {
    heading.current?.focus()
  }, [ws.newShopStep])
  return (
    <Box ref={root} sx={{ py: { xs: 3, md: 10 }, px: { xs: 1, md: 4 } }}>
      <Box data-chalk-shop aria-hidden="true" sx={{ color: roles.primary, mb: 2 }}>
        <svg width="112" height="78" viewBox="0 0 160 110" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M28 49L39 22L123 20L135 47M32 52L34 96L130 94L132 52M28 49Q39 62 50 49Q61 62 72 49Q83 61 94 49Q105 61 116 49Q126 60 135 47M52 25L50 49M75 24L72 49M97 23L94 49M117 23L116 49M48 70L75 69L75 86L48 87ZM94 96L93 68L115 68L117 95M22 102L141 100M12 28L5 21M144 19L151 12M17 66L8 69" />
          <path d="M67 12Q80 2 94 11M105 80L108 80" />
        </svg>
      </Box>
      <Typography ref={heading} tabIndex={-1} component="h1" variant="displaySmall" data-chalk-title
        sx={{ fontFamily: HAND_FONT, fontSize: { xs: '2.8rem', md: '4rem' }, lineHeight: 1.12, textWrap: 'balance', mb: 3, '&:focus': { outline: 'none' } }}>
        {f.title}
      </Typography>
      <Typography role="status" variant="labelLarge" sx={{ color: roles.primary }}>{t.newShopStep(ws.newShopStep)}</Typography>
      <Box component="ol" aria-label={t.newShopMode} sx={{ listStyle: 'none', p: 0, my: 3, display: 'grid', gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', md: '1fr' }, gap: { xs: 1, md: 3 } }}>
        {f.steps.map((label, index) => (
          <Box component="li" key={label} aria-current={ws.newShopStep === index + 1 ? 'step' : undefined}
            sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1, alignItems: { xs: 'flex-start', md: 'center' }, color: ws.newShopStep === index + 1 ? roles.onSurface : roles.onSurfaceVariant }}>
            <Box aria-hidden="true" sx={{ display: 'grid', placeItems: 'center', width: 28, height: 28, flexShrink: 0, borderRadius: '50%', border: `1px solid ${roles.outline}`, bgcolor: ws.newShopStep === index + 1 ? roles.primaryContainer : 'transparent', color: ws.newShopStep === index + 1 ? roles.onPrimaryContainer : 'inherit' }}>
              {ws.newShopStep > index + 1 ? <Check size={16} /> : index + 1}
            </Box>
            <Typography variant="labelMedium" sx={{ overflowWrap: 'anywhere' }}>{label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

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
    <Box ref={root} sx={{ width: '100%', maxWidth: 780, mx: 'auto', textAlign: 'center', py: { xs: 8, md: 14 }, px: 2 }}>
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
