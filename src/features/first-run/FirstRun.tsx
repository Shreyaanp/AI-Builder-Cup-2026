import { useRef, useState, type ReactNode } from 'react'
import { Box, Button, Dialog, Stack, Typography, useTheme } from '@mui/material'
import { MapPin, QrCode, Gift, Store, Stamp, Bot } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { explainerCopy } from './copy'
import { hasSeen, remember, type Audience } from './seen'

/** A customer who scanned a shop's QR came for that shop and its stamp, not the intro (OB-65). */
function qrArrival(app: Audience) {
  return app === 'customer' && new URLSearchParams(window.location.search).get('source') === 'qr'
}

/** Blocks setup until the device's introduction is finished or skipped. A QR arrival defers it to
 * the next visit. */
export function FirstRun({ app, children }: { app: Audience; children: ReactNode }) {
  const [open, setOpen] = useState(() => !hasSeen(app) && !qrArrival(app))
  return open && !hasSeen(app) ? (
    <Cards
      app={app}
      onClose={() => {
        remember(app)
        setOpen(false)
      }}
    />
  ) : (
    children
  )
}

export function SeeAgain({ app }: { app: Audience }) {
  const [open, setOpen] = useState(false)
  const t = explainerCopy[useLocale()]
  return (
    <>
      <Button onClick={() => setOpen(true)} sx={{ minHeight: 48 }}>
        {t[9]}
      </Button>
      {open && <Cards app={app} onClose={() => setOpen(false)} />}
    </>
  )
}

function Cards({ app, onClose }: { app: Audience; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const t = explainerCopy[useLocale()]
  const roles = useTheme().material
  const Icon = (app === 'owner' ? [Store, Stamp, Bot] : [MapPin, QrCode, Gift])[step]!
  const headline = t[(app === 'owner' ? 0 : 3) + step]!
  const move = (delta: number) => setStep((n) => Math.max(0, Math.min(2, n + delta)))
  return (
    <Dialog
      fullScreen
      open
      transitionDuration={0}
      onClose={onClose}
      aria-labelledby="explainer-title"
    >
      <Stack
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            move(1)
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            move(-1)
          }
        }}
        onTouchStart={(event) => {
          const p = event.touches[0]!
          start.current = { x: p.clientX, y: p.clientY }
        }}
        onTouchEnd={(event) => {
          const p = event.changedTouches[0]!
          if (start.current) {
            const dx = p.clientX - start.current.x
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(p.clientY - start.current.y))
              move(dx < 0 ? 1 : -1)
          }
          start.current = null
        }}
        sx={{
          minHeight: '100dvh',
          bgcolor: roles.surface,
          p: 3,
          pt: 'max(24px, env(safe-area-inset-top))',
          pb: 'max(24px, env(safe-area-inset-bottom))',
          '& button': { minHeight: 48, minWidth: 48 },
        }}
      >
        <Box sx={{ alignSelf: 'flex-end' }}>
          <Button onClick={onClose}>{t[6]}</Button>
        </Box>
        <Stack
          sx={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 5,
            maxWidth: 480,
            width: '100%',
            mx: 'auto',
            py: 4,
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              width: 'min(64vw, 280px)',
              aspectRatio: '1',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '28px',
              bgcolor: roles.primaryContainer,
              color: roles.onPrimaryContainer,
            }}
          >
            <Icon size="60%" strokeWidth={1.25} />
          </Box>
          <Typography
            id="explainer-title"
            component="h1"
            variant="headlineLarge"
            aria-live="polite"
            sx={{ textAlign: 'center', textWrap: 'balance', overflowWrap: 'anywhere' }}
          >
            {headline}
          </Typography>
        </Stack>
        <Stack sx={{ width: '100%', maxWidth: 480, mx: 'auto', gap: 2 }}>
          <Stack direction="row" aria-hidden="true" sx={{ justifyContent: 'center', gap: 1 }}>
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: i === step ? roles.primary : roles.outlineVariant,
                }}
              />
            ))}
          </Stack>
          <Stack direction="row" sx={{ gap: 2 }}>
            {step > 0 && <Button onClick={() => move(-1)}>{t[10]}</Button>}
            <Button
              variant="contained"
              sx={{ flex: 1 }}
              onClick={() => (step === 2 ? onClose() : move(1))}
            >
              {step === 2 ? t[8] : t[7]}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Dialog>
  )
}
