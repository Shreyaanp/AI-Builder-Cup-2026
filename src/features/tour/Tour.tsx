import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Card,
  CircularProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Sparkles } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { useWorkspace } from '../v1/workspaceContext'
import type { Destination } from '../v1/workspaceContext'
import { tourCopy } from './strings'
import { startDemoTour } from './tourActions'
import { tour, useTourRunning } from './tourStore'

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
// Where each step's spotlight lands (data-tour anchors) and which screen it lives on.
const STEPS: { target: string; destination: Destination }[] = [
  { target: 'menu', destination: 'shop' },
  { target: 'menu', destination: 'shop' },
  { target: 'prep', destination: 'grow' },
  { target: 'closeday', destination: 'grow' },
  { target: 'orders', destination: 'grow' },
  { target: 'composer', destination: 'coach' },
  { target: 'google', destination: 'grow' },
  { target: 'customer', destination: 'shop' },
]
const PAD = 8

type Rect = { top: number; left: number; width: number; height: number }

function find(target: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`))
  return all.find((el) => el.offsetParent !== null) ?? null
}

/** Spotlight walkthrough over the demo shop. Mounted once by the app shell. */
export function TourHost() {
  const running = useTourRunning()
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  const roles = useTheme().material
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const done = step >= STEPS.length

  const measure = useCallback(() => {
    if (done) return setRect(null)
    const current = STEPS[step]
    const el = current && find(current.target)
    if (!el) return setRect(null)
    const box = el.getBoundingClientRect()
    setRect({
      top: box.top - PAD,
      left: box.left - PAD,
      width: box.width + PAD * 2,
      height: Math.min(box.height + PAD * 2, window.innerHeight * 0.6),
    })
  }, [step, done])

  // Each step: go to its screen, wait for its anchor, bring it into view, then measure.
  useEffect(() => {
    const current = STEPS[step]
    if (!running || done || !current) return
    ws.go(current.destination)
    let frames = 0
    let raf = 0
    const seek = () => {
      const el = find(current.target)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
        requestAnimationFrame(measure)
        return
      }
      if (frames++ < 120) raf = requestAnimationFrame(seek)
      else setRect(null)
    }
    raf = requestAnimationFrame(seek)
    return () => cancelAnimationFrame(raf)
    // ws.go is stable enough per step; re-run only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, step, done])

  useLayoutEffect(() => {
    if (!running) return
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [running, measure])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!running) return
      if (event.key === 'Escape') close()
      if (event.key === 'ArrowRight') setStep((n) => Math.min(n + 1, STEPS.length))
      if (event.key === 'ArrowLeft') setStep((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [running])

  function close() {
    setStep(0)
    tour.stop()
  }
  if (!running) return null
  const copy = done ? null : t.steps[step]
  const below = rect ? rect.top + rect.height + 220 < window.innerHeight : true
  const cardTop = rect ? (below ? rect.top + rect.height + 12 : Math.max(12, rect.top - 212)) : 0

  return (
    <Box
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        '@keyframes tourRise': {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to: { opacity: 1, transform: 'none' },
        },
      }}
    >
      {/* The scrim with a moving cut-out around the highlighted element. */}
      <Box
        aria-hidden="true"
        onClick={() => setStep((n) => n + 1)}
        sx={{
          position: 'fixed',
          borderRadius: '20px',
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          pointerEvents: 'auto',
          transition: `top 450ms ${EASE}, left 450ms ${EASE}, width 450ms ${EASE}, height 450ms ${EASE}, opacity 300ms`,
          outline: rect ? `2px solid ${roles.primary}` : 'none',
          ...(rect
            ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            : { top: '50%', left: '50%', width: 0, height: 0 }),
        }}
      />
      <Card
        key={step}
        elevation={8}
        sx={{
          position: 'fixed',
          left: 16,
          right: 16,
          mx: 'auto',
          maxWidth: 420,
          p: 4,
          borderRadius: '24px',
          bgcolor: roles.surfaceContainerHigh,
          animation: `tourRise 360ms ${EASE} both`,
          ...(done || !rect ? { top: '50%', transform: 'translateY(-50%)' } : { top: cardTop }),
        }}
      >
        {done ? (
          <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
            <Box sx={{ color: roles.primary }}>
              <Sparkles size={28} />
            </Box>
            <Typography id="tour-title" variant="titleLarge">
              {t.doneTitle}
            </Typography>
            <Typography color="text.secondary">{t.doneBody}</Typography>
            <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', pt: 1 }}>
              <Button
                variant="contained"
                onClick={() => {
                  close()
                  ws.startNewShop()
                }}
              >
                {t.startMine}
              </Button>
              <Button onClick={close}>{t.keepExploring}</Button>
            </Stack>
          </Stack>
        ) : (
          <>
            <Typography variant="labelMedium" color="text.secondary">
              {t.stepOf.replace('{n}', String(step + 1)).replace('{total}', String(STEPS.length))}
            </Typography>
            <Typography id="tour-title" variant="titleLarge" sx={{ mt: 0.5 }}>
              {copy?.title}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {copy?.body}
            </Typography>
            <Stack direction="row" sx={{ mt: 3, alignItems: 'center', gap: 1 }}>
              <Stack direction="row" sx={{ gap: 0.75, flex: 1 }} aria-hidden="true">
                {STEPS.map((_, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: i === step ? 18 : 6,
                      height: 6,
                      borderRadius: 3,
                      bgcolor: i <= step ? roles.primary : roles.outlineVariant,
                      transition: `width 300ms ${EASE}`,
                    }}
                  />
                ))}
              </Stack>
              <Button size="small" onClick={close}>
                {t.skip}
              </Button>
              {step > 0 && (
                <Button size="small" onClick={() => setStep((n) => n - 1)}>
                  {t.back}
                </Button>
              )}
              <Button variant="contained" size="small" onClick={() => setStep((n) => n + 1)}>
                {t.next}
              </Button>
            </Stack>
          </>
        )}
      </Card>
    </Box>
  )
}

/** Offer card for owners with no shop yet: creates the filled demo shop and starts the tour. */
export function TourOffer() {
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  const roles = useTheme().material
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <Box
      sx={{
        p: 4,
        borderRadius: '24px',
        bgcolor: roles.secondaryContainer,
        color: roles.onSecondaryContainer,
      }}
    >
      <Typography variant="titleMedium">{t.offerTitle}</Typography>
      <Typography variant="bodyMedium" sx={{ mt: 1 }}>
        {t.offerBody}
      </Typography>
      <Button
        variant="contained"
        sx={{ mt: 3 }}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} /> : <Sparkles size={18} />}
        onClick={() => void startDemoTour(ws, setBusy, setFailed)}
      >
        {busy ? t.preparing : t.offerButton}
      </Button>
      {failed && (
        <Typography variant="bodySmall" color="error" sx={{ mt: 1 }} role="alert">
          {t.failed}
        </Typography>
      )}
    </Box>
  )
}

/** Settings entry: replay the tour on the demo shop at any time. */
export function TourMenuButton({ onStart }: { onStart: () => void }) {
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  return (
    <ButtonBase
      onClick={() => {
        onStart()
        void startDemoTour(ws)
      }}
      sx={{ minHeight: 48, width: '100%', px: 2, gap: 2, justifyContent: 'flex-start' }}
    >
      <Sparkles size={18} aria-hidden="true" />
      <Typography variant="bodyLarge">{t.settings}</Typography>
    </ButtonBase>
  )
}
