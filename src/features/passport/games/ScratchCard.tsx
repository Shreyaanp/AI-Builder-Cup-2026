import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Alert, Box, Button, Chip, Collapse, Stack, Typography, useTheme } from '@mui/material'
import { gsap } from 'gsap'
import { CalendarClock, Gift, Percent, Snowflake, Sparkles } from 'lucide-react'
import { HAND_FONT, HAND_SIZE } from '../../../design/theme'
import { useLocale } from '../../../state/hooks'
import { fill } from '../copy'
import { setPassport } from '../store'
import type { PassportView } from '../store'
import { useGameActions } from './api'
import type { PrizeKind, ScratchView } from './api'
import { useGamesCopy } from './copy'
import type { GamesStrings } from './copy'
import { HowItWorks } from './HowItWorks'

type Opened = { card: ScratchView; passport: PassportView | null }

const HEIGHT = 176
const BRUSH = 46
// Scratch this share of the foil and the card opens by itself.
const OPEN_AT = 0.45

const PRIZE_ICON: Record<PrizeKind, typeof Gift> = {
  points_10: Sparkles,
  points_25: Sparkles,
  perk: Gift,
  freeze: Snowflake,
  again: CalendarClock,
}

function prizeLines(card: ScratchView, t: GamesStrings) {
  const prize = card.prize ?? 'again'
  const title =
    prize === 'perk' ? fill(t.prize_perk, { perk: card.perk_text ?? '' }) : t[`prize_${prize}`]
  const body =
    prize === 'perk'
      ? fill(t.prizeBody_perk, { shop: card.shop_name.replace(/\s*\(Demo\)$/, '') })
      : prize === 'points_10' || prize === 'points_25'
        ? t.prizeBody_points
        : t[`prizeBody_${prize}`]
  return { title, body }
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * A scratch card earned by a verified stamp. The prize was
 * drawn on the server when the stamp was made; the first touch asks the server to open the card,
 * and the foil comes away under the finger or mouse. A Reveal button does the same for keyboard
 * and screen-reader users. The odds that apply to this card are one tap away.
 */
export function ScratchCard({
  card,
  place,
  onOpened,
}: {
  card: ScratchView
  place?: { lat: number; lng: number } | null
  onOpened?: (card: ScratchView) => void
}) {
  const t = useGamesCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const gold = theme.chalk.sunflower
  const { reveal } = useGameActions(place)
  const canvas = useRef<HTMLCanvasElement>(null)
  const scope = useRef<HTMLDivElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const moves = useRef(0)
  const request = useRef<Promise<void> | null>(null)
  const wantsOpen = useRef(false)
  const scratching = useRef(false)
  const [opened, setOpened] = useState<Opened | null>(
    card.revealed ? { card, passport: null } : null,
  )
  const [done, setDone] = useState(card.revealed)
  const [failed, setFailed] = useState(false)
  const [showOdds, setShowOdds] = useState(false)
  const oddsId = useId()
  const hintId = useId()
  const shop = card.shop_name.replace(/\s*\(Demo\)$/, '')

  const stopScratching = useCallback(() => {
    last.current = null
    if (scratching.current) {
      scratching.current = false
      document.body.style.overscrollBehavior = ''
    }
  }, [])

  useLayoutEffect(() => {
    return () => {
      document.body.style.overscrollBehavior = ''
    }
  }, [])

  // The foil: sunflower gold with chalk hatching and a hand-written "Scratch here".
  const paint = useCallback(() => {
    const element = canvas.current
    if (!element) return
    const ratio = window.devicePixelRatio || 1
    const width = element.clientWidth
    element.width = Math.round(width * ratio)
    element.height = Math.round(HEIGHT * ratio)
    const context = element.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.scale(ratio, ratio)
    const gradient = context.createLinearGradient(0, 0, width, HEIGHT)
    gradient.addColorStop(0, '#E9B949')
    gradient.addColorStop(0.5, '#F7DA7A')
    gradient.addColorStop(1, '#D9A230')
    context.fillStyle = gradient
    context.fillRect(0, 0, width, HEIGHT)
    context.strokeStyle = 'rgba(255,255,255,0.28)'
    context.lineWidth = 2
    for (let x = -HEIGHT; x < width; x += 14) {
      context.beginPath()
      context.moveTo(x, HEIGHT)
      context.lineTo(x + HEIGHT, 0)
      context.stroke()
    }
    context.fillStyle = '#3B2A00'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `700 34px ${HAND_FONT}`
    context.fillText(t.scratchHere, width / 2, HEIGHT / 2 - 8)
    context.font = `500 15px ${HAND_FONT}`
    context.fillText('★  ★  ★', width / 2, HEIGHT / 2 + 26)
  }, [t.scratchHere])

  useLayoutEffect(() => {
    if (!done) paint()
  }, [done, paint])

  const finish = useCallback(
    (result: Opened) => {
      setDone(true)
      const won = result.card.prize !== 'again'
      navigator.vibrate?.(won ? [20, 40, 30] : 15)
      const root = scope.current
      if (root && !reducedMotion()) {
        const timeline = gsap.timeline()
        timeline
          .to(canvas.current, { opacity: 0, scale: 1.04, duration: 0.3, ease: 'power2.in' })
          .fromTo(
            root.querySelector('.scratch-prize'),
            { scale: 0.7, rotate: -6 },
            { scale: 1, rotate: 0, duration: 0.45, ease: 'back.out(2.6)' },
            '<0.1',
          )
        if (won)
          timeline.fromTo(
            root.querySelectorAll('.scratch-dust'),
            { x: 0, y: 0, opacity: 1, scale: 1 },
            {
              x: (i: number) => Math.cos((i / 12) * Math.PI * 2) * 120,
              y: (i: number) => Math.sin((i / 12) * Math.PI * 2) * 70,
              opacity: 0,
              scale: 0.3,
              duration: 0.7,
              ease: 'power2.out',
            },
            '<',
          )
        root.addEventListener('pointerdown', () => timeline.progress(1), { once: true })
      }
      // Counters move only once the prize is visible.
      if (result.passport) setPassport(result.passport)
      onOpened?.(result.card)
    },
    [onOpened],
  )

  const open = useCallback(() => {
    if (request.current) return request.current
    setFailed(false)
    request.current = reveal(card.id)
      .then((result) => {
        setOpened(result)
        if (wantsOpen.current) finish(result)
      })
      .catch(() => {
        request.current = null
        wantsOpen.current = false
        setFailed(true)
      })
    return request.current
  }, [card.id, finish, reveal])

  const openNow = useCallback(() => {
    wantsOpen.current = true
    if (opened) finish(opened)
    else void open()
  }, [finish, open, opened])

  function scratch(event: PointerEvent<HTMLCanvasElement>) {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context || done) return
    const box = element.getBoundingClientRect()
    const point = { x: event.clientX - box.left, y: event.clientY - box.top }
    context.globalCompositeOperation = 'destination-out'
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = BRUSH
    context.beginPath()
    const from = last.current ?? point
    context.moveTo(from.x, from.y)
    context.lineTo(point.x + 0.1, point.y)
    context.stroke()
    last.current = point
    moves.current += 1
    if (moves.current % 6 === 0 && cleared(element) >= OPEN_AT) openNow()
  }

  const prize = opened?.card.revealed ? prizeLines(opened.card, t) : null
  const Icon = PRIZE_ICON[opened?.card.prize ?? 'points_10']
  const percent = new Intl.NumberFormat(locale, { style: 'percent' })
  return (
    <Box ref={scope} sx={{ position: 'relative' }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="labelLarge" sx={{ flex: 1, minWidth: 0 }}>
          {fill(t.scratchFrom, { shop })}
        </Typography>
        <HowItWorks game="scratch" />
      </Stack>
      <Box
        data-testid="scratch-card-foil-container"
        sx={{
          position: 'relative',
          height: HEIGHT,
          borderRadius: '20px',
          overflow: 'hidden',
          bgcolor: gold.container,
          color: gold.onContainer,
          boxShadow: `0 0 0 3px ${gold.main} inset`,
          touchAction: 'none',
          overscrollBehavior: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* The prize under the foil; announced once the card is open. */}
        <Stack
          className="scratch-prize"
          role="status"
          aria-live="polite"
          sx={{
            position: 'absolute',
            inset: 0,
            p: 3,
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 0.5,
          }}
        >
          {prize ? (
            <>
              <Icon size={34} aria-hidden="true" />
              <Typography
                component="p"
                sx={{
                  fontFamily: HAND_FONT,
                  fontWeight: 700,
                  fontSize: HAND_SIZE,
                  lineHeight: 1.1,
                }}
              >
                {done ? prize.title : ''}
              </Typography>
              {done && (
                <Typography variant="bodyMedium" sx={{ maxWidth: 300 }}>
                  {prize.body}
                </Typography>
              )}
              {done && opened?.card.demo && opened.card.prize !== 'again' && (
                <Chip size="small" label={t.demoPrize} sx={{ mt: 0.5 }} />
              )}
            </>
          ) : (
            <Percent size={40} aria-hidden="true" style={{ opacity: 0.25 }} />
          )}
        </Stack>
        {Array.from({ length: 12 }, (_, i) => (
          <Box
            key={i}
            className="scratch-dust"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 10,
              height: 10,
              borderRadius: i % 3 ? '50%' : '2px',
              bgcolor: i % 2 ? gold.main : theme.chalk.coral.main,
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
        ))}
        {!done && (
          <Box
            component="canvas"
            ref={canvas}
            aria-hidden="true"
            data-testid="scratch-foil"
            onPointerDown={(event: PointerEvent<HTMLCanvasElement>) => {
              if (event.cancelable) event.preventDefault()
              scratching.current = true
              document.body.style.overscrollBehavior = 'none'
              event.currentTarget.setPointerCapture?.(event.pointerId)
              last.current = null
              void open()
              scratch(event)
            }}
            onPointerMove={(event: PointerEvent<HTMLCanvasElement>) => {
              if (event.buttons || event.pointerType === 'touch') {
                if (event.cancelable) event.preventDefault()
                scratch(event)
              }
            }}
            // The stamp sheet around the card must not take a downward scratch for a swipe-close.
            onTouchStart={(event) => {
              ;(
                event.nativeEvent as TouchEvent & { defaultMuiPrevented?: boolean }
              ).defaultMuiPrevented = true
            }}
            onPointerUp={stopScratching}
            onPointerCancel={stopScratching}
            onLostPointerCapture={stopScratching}
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              touchAction: 'none',
              overscrollBehavior: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              cursor: 'grab',
              transformOrigin: 'center',
            }}
          />
        )}
      </Box>
      {failed && (
        <Alert
          severity="error"
          sx={{ mt: 2 }}
          action={
            <Button color="inherit" onClick={openNow}>
              {t.retry}
            </Button>
          }
        >
          {t.scratchFailed}
        </Alert>
      )}
      <Stack direction="row" sx={{ mt: 1.5, gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {!done && (
          <>
            <Typography
              id={hintId}
              variant="bodySmall"
              color="text.secondary"
              sx={{ flex: '1 1 100%' }}
            >
              {t.scratchHint}
            </Typography>
            <Button
              variant="contained"
              onClick={openNow}
              aria-describedby={hintId}
              aria-label={fill(t.scratchArea, { shop })}
              sx={{ minHeight: 48 }}
            >
              {t.scratchReveal}
            </Button>
          </>
        )}
        <Button
          size="small"
          onClick={() => setShowOdds((value) => !value)}
          aria-expanded={showOdds}
          aria-controls={oddsId}
          sx={{ minHeight: 48 }}
        >
          {t.odds}
        </Button>
      </Stack>
      <Collapse in={showOdds}>
        <Box
          id={oddsId}
          sx={{ mt: 1, p: 3, borderRadius: '16px', bgcolor: roles.surfaceContainerHighest }}
        >
          <Typography component="h3" variant="titleSmall" sx={{ fontWeight: 700, mb: 1 }}>
            {t.oddsTitle}
          </Typography>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr auto' }}>
            {card.odds.map((odd) => (
              <Box key={odd.prize} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="bodyMedium" sx={{ py: 0.5 }}>
                  {t[`odds_${odd.prize}`]}
                </Typography>
                <Typography
                  component="dd"
                  variant="labelLarge"
                  sx={{ m: 0, py: 0.5, fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}
                >
                  {percent.format(odd.percent / 100)}
                </Typography>
              </Box>
            ))}
          </Box>
          {card.first && (
            <Typography variant="bodyMedium" sx={{ mt: 1, fontWeight: 700 }}>
              {t.oddsFirst}
            </Typography>
          )}
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
            {t.oddsNote}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  )
}

/** The share of the foil already scratched away (sampled, so it stays cheap). */
function cleared(element: HTMLCanvasElement) {
  const context = element.getContext('2d')
  if (!context || !element.width) return 0
  const { data } = context.getImageData(0, 0, element.width, element.height)
  let clear = 0
  let total = 0
  for (let i = 3; i < data.length; i += 4 * 24) {
    total += 1
    if (data[i] === 0) clear += 1
  }
  return total ? clear / total : 0
}
