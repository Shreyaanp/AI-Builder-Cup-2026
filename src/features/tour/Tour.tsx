import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Card,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { X, Sparkles, Volume2, VolumeX } from 'lucide-react'
import FocusTrap from '@mui/material/Unstable_TrapFocus'
import { useLocale } from '../../state/hooks'
import { useWorkspace } from '../v1/workspaceContext'
import type { Destination } from '../v1/workspaceContext'
import { tourCopy } from './strings'
import { startDemoTour } from './tourActions'
import { tour, useTourRunning } from './tourStore'
import { narrationQueue } from './narrationQueue'
import { narrationVoice } from './narrationVoice'

import { motion } from '../../design/theme'
import { chainStep } from './chainSteps'
import { chainCopy } from './chainCopy'
import { useChainStory } from './chainData'
import { placeCard } from './tourLayout'
import type { Box as Rect } from './tourLayout'

const EASE = motion.easing.emphasized
// Where each step's spotlight lands (data-tour anchors), which screen it lives on and whose copy
// it reads: a translated spotlight, or a line built from the shop's seeded records. Every step
// lights a real element on the real screen; a step whose element is missing is skipped.
type Step = {
  target: string
  destination: Destination
  kind: 'spot' | 'story'
  index: number
}
const spot = (index: number, target: string, destination: Destination): Step => ({
  target,
  destination,
  kind: 'spot',
  index,
})
const story = (index: number, target: string): Step => ({
  target,
  destination: 'coach',
  kind: 'story',
  index,
})
const STEPS: Step[] = [
  spot(0, 'today', 'coach'),
  story(0, 'today-supply'),
  story(1, 'reorder'),
  spot(2, 'forecast', 'coach'),
  spot(1, 'menu', 'shop'),
  spot(3, 'closeday', 'grow'),
  spot(5, 'composer', 'coach'),
]
const PAD = 8
const FIND_MS = 8000
const NARRATION_PREF = 'chalkboard.tour.narration'

function find(target: string): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`))
  return all.find((el) => el.offsetParent !== null) ?? null
}

/** The nearest ancestor that scrolls, or the page. */
function scroller(el: HTMLElement): HTMLElement {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight)
      return node
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/** Fixed and sticky targets (the composer, the tabs) stay where they are whatever the page does. */
function pinned(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const position = getComputedStyle(node).position
    if (position === 'fixed' || position === 'sticky') return true
  }
  return false
}

/** Whether the target sits where the spotlight wants it: on screen, and clear of a phone's card. */
function placed(el: HTMLElement, cardHeight: number): boolean {
  const box = el.getBoundingClientRect()
  if (pinned(el)) return true
  if (window.innerWidth >= 600)
    return (
      (box.top >= 0 && box.bottom <= window.innerHeight) || box.height > window.innerHeight * 0.8
    )
  return box.top >= 0 && (box.bottom <= window.innerHeight - cardHeight - 24 || box.top <= PAD + 16)
}

/** Bring a target into view, clear of the card: on a phone the card sits under it. */
function align(el: HTMLElement, cardHeight: number) {
  if (pinned(el)) return
  el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
  if (window.innerWidth >= 600) return
  const free = window.innerHeight - cardHeight - 56
  const box = el.getBoundingClientRect()
  const want = box.height < free ? Math.max(PAD + 8, (free - box.height) / 2 + PAD) : PAD + 8
  scroller(el).scrollTop += box.top - want
}

/** Spotlight walkthrough over the demo shop. Mounted once by the app shell. */
export function TourHost() {
  const running = useTourRunning()
  const ws = useWorkspace()
  const language = useLocale()
  const t = tourCopy(language)
  const tale = useChainStory(running)
  const chain = chainCopy(language)
  const roles = useTheme().material
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [narrated, setNarrated] = useState(() => {
    try {
      return localStorage.getItem(NARRATION_PREF) === 'true'
    } catch {
      return false
    }
  })
  const narration = useMemo(
    () => narrationQueue(narrationVoice(ws.api, ws.demo)),
    [ws.api, ws.demo],
  )
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [cardHeight, setCardHeight] = useState(240)
  const cardRef = useRef<HTMLDivElement>(null)
  // Which way the owner is walking, so a step with nothing to show is passed over, not stopped at.
  const direction = useRef(1)
  const realigns = useRef(0)
  const done = step >= STEPS.length
  const current = done ? null : STEPS[step]
  const copy = !current
    ? null
    : current.kind === 'spot'
      ? t.steps[current.index]
      : chainStep(current.index, tale, chain, language)
  const spokenText = copy ? `${copy.title}. ${copy.body}` : ''

  // Tours are opened by a tap on an offer/menu control. A saved preference alone never starts one.
  useEffect(() => {
    if (running && narrated && spokenText) void narration.speak(spokenText, language)
    return () => narration.stop()
  }, [running, narrated, spokenText, language, narration])

  const move = useCallback(
    (delta: number) => {
      narration.stop()
      direction.current = delta
      setStep((n) => Math.max(0, Math.min(n + delta, STEPS.length)))
    },
    [narration],
  )

  const close = useCallback(() => {
    narration.stop()
    setStep(0)
    tour.stop()
  }, [narration])

  function toggleNarration() {
    narration.stop()
    const next = !narrated
    setNarrated(next)
    try {
      localStorage.setItem(NARRATION_PREF, String(next))
    } catch {
      // Still usable when preference storage is unavailable.
    }
  }

  const measure = useCallback(() => {
    if (done) return setRect(null)
    const current = STEPS[step]
    const el = current && find(current.target)
    if (!el) return setRect(null)
    let box = el.getBoundingClientRect()
    // Late content can push the target off screen after the first scroll: bring it back.
    const cardNow = cardRef.current?.offsetHeight ?? 240
    if (!placed(el, cardNow) && realigns.current++ < 20) {
      align(el, cardNow)
      box = el.getBoundingClientRect()
    }
    setRect({
      top: box.top - PAD,
      left: box.left - PAD,
      width: box.width + PAD * 2,
      height: box.height + PAD * 2,
    })
  }, [step, done])

  // Each step: go to its screen, wait for its anchor, bring it into view clear of the card, then
  // measure. The last stop is the Coach home.
  useEffect(() => {
    const current = STEPS[step]
    if (!running) return
    if (done || !current) {
      ws.go('coach')
      return
    }
    ws.go(current.destination)
    realigns.current = 0
    const started = performance.now()
    let raf = 0
    // A screen can re-mount or load late content after the first scroll: keep the target in
    // view for a moment, then stay put.
    const settle = (since: number) => {
      const el = find(current.target)
      if (el) {
        const cardNow = cardRef.current?.offsetHeight ?? 240
        if (!placed(el, cardNow)) align(el, cardNow)
      }
      measure()
      if (performance.now() - since < 3000) raf = requestAnimationFrame(() => settle(since))
    }
    const seek = () => {
      const el = find(current.target)
      if (el) {
        align(el, cardRef.current?.offsetHeight ?? 240)
        settle(performance.now())
        return
      }
      if (performance.now() - started < FIND_MS) raf = requestAnimationFrame(seek)
      else {
        // Nothing real to show here: leave the step out rather than float an empty box.
        setRect(null)
        const next = step + direction.current
        if (next >= 0) setStep(Math.min(next, STEPS.length))
        else direction.current = 1
      }
    }
    raf = requestAnimationFrame(seek)
    return () => cancelAnimationFrame(raf)
    // ws.go is stable enough per step; re-run only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, step, done])

  useLayoutEffect(() => {
    if (!running) return
    const observer = new ResizeObserver(measure)
    const target = STEPS[step] && find(STEPS[step]!.target)
    if (target) observer.observe(target)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [running, measure, step])

  // The card's own height decides how much room the spotlight keeps.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!running || !card) return
    const read = () => setCardHeight(card.offsetHeight)
    read()
    const observer = new ResizeObserver(read)
    observer.observe(card)
    return () => observer.disconnect()
  }, [running, step, done])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!running) return
      if (event.key === 'Escape') close()
      if (event.key === 'ArrowRight') move(1)
      if (event.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [running, close, move])

  if (!running) return null
  const layout =
    rect && !done
      ? placeCard(
          rect,
          { width: window.innerWidth, height: window.innerHeight, safeBottom: 0 },
          cardHeight,
        )
      : null

  return (
    <>
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
          data-testid="tour-spot"
          onClick={() => move(1)}
          sx={{
            position: 'fixed',
            borderRadius: '20px',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
            pointerEvents: 'auto',
            transition: reducedMotion ? 'none' : `opacity 300ms ${EASE}`,
            outline: layout ? `2px solid ${roles.primary}` : 'none',
            ...(layout
              ? {
                  top: layout.spot.top,
                  left: layout.spot.left,
                  width: layout.spot.width,
                  height: layout.spot.height,
                }
              : { top: '50%', left: '50%', width: 0, height: 0 }),
          }}
        />
        <FocusTrap open>
          <Card
            key={step}
            ref={cardRef}
            data-testid="tour-card"
            tabIndex={-1}
            elevation={8}
            sx={{
              position: 'fixed',
              boxSizing: 'border-box',
              p: { xs: 3, sm: 4 },
              borderRadius: '24px',
              bgcolor: roles.surfaceContainerHigh,
              animation: reducedMotion ? 'none' : `tourRise 360ms ${EASE} both`,
              maxHeight: 'calc(100dvh - 32px - env(safe-area-inset-bottom))',
              overflowY: 'auto',
              ...(done || !layout
                ? {
                    top: `max(16px, calc(50% - ${cardHeight / 2}px))`,
                    left: 16,
                    right: 16,
                    mx: 'auto',
                    maxWidth: 420,
                  }
                : { top: layout.card.top, left: layout.card.left, width: layout.card.width }),
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
                <Stack
                  direction="row"
                  sx={{ gap: 2, flexWrap: 'wrap', pt: 1, '& button': { minHeight: 48 } }}
                >
                  <Button
                    variant="contained"
                    onClick={() => {
                      close()
                      // The tour runs in the read-only demo (OB-30): a shop of their own starts in
                      // the business app (through sign-in when needed), not inside the sandbox.
                      if (location.pathname.startsWith('/demo'))
                        location.assign('/new-shop?app=business')
                      else ws.startNewShop()
                    }}
                  >
                    {t.startMine}
                  </Button>
                  <Button onClick={close}>{t.keepExploring}</Button>
                </Stack>
              </Stack>
            ) : (
              <>
                <Stack
                  direction="row"
                  sx={{ alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography variant="labelMedium" color="text.secondary">
                    {t.stepOf
                      .replace('{n}', String(step + 1))
                      .replace('{total}', String(STEPS.length))}
                  </Typography>
                  <IconButton aria-label={t.close} onClick={close} sx={{ width: 48, height: 48 }}>
                    <X size={22} />
                  </IconButton>
                  <IconButton
                    aria-label={t.narration}
                    aria-pressed={narrated}
                    onClick={toggleNarration}
                    sx={{
                      width: 48,
                      height: 48,
                      color: narrated ? roles.primary : roles.onSurfaceVariant,
                    }}
                  >
                    {narrated ? <Volume2 size={22} /> : <VolumeX size={22} />}
                  </IconButton>
                </Stack>
                <Typography id="tour-title" variant="titleLarge" sx={{ mt: 0.5 }}>
                  {copy?.title}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {copy?.body}
                </Typography>
                <Stack
                  direction="row"
                  sx={{
                    mt: 3,
                    alignItems: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                    '& button': { minHeight: 48 },
                  }}
                >
                  <Stack direction="row" sx={{ gap: 0.75, flex: 1 }} aria-hidden="true">
                    {STEPS.map((_, i) => (
                      <Box
                        key={i}
                        sx={{
                          width: i === step ? 18 : 6,
                          height: 6,
                          borderRadius: 3,
                          bgcolor: i <= step ? roles.primary : roles.outlineVariant,
                        }}
                      />
                    ))}
                  </Stack>
                  {narrated ? (
                    <Button size="small" onClick={() => narration.stop()}>
                      {t.skipVoice}
                    </Button>
                  ) : (
                    <Button size="small" onClick={close}>
                      {t.skip}
                    </Button>
                  )}
                  {step > 0 && (
                    <Button size="small" onClick={() => move(-1)}>
                      {t.back}
                    </Button>
                  )}
                  <Button variant="contained" size="small" onClick={() => move(1)}>
                    {t.next}
                  </Button>
                </Stack>
              </>
            )}
          </Card>
        </FocusTrap>
      </Box>
    </>
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
