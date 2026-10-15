import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, AlertTitle, Box, Button, Stack, Typography, useTheme } from '@mui/material'
import {
  Bike,
  Clock,
  Keyboard,
  MapPin,
  MicOff,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Store,
  Wallet,
} from 'lucide-react'
import { chalkWrite } from '../../design/chalkMotion'
import { HAND_FONT, motion, shape } from '../../design/theme'
import type { Business, Product } from './api'
import { defaultCurrency, formatPrice } from './format'
import { readablePlace } from './location'
import { useNewShopCopy } from './newShopCopy'
import { factEntries } from './shopProgress'
import { useCopy } from './strings'
import type { VoiceProblem } from './useVoice'
import { useVoiceModeCopy } from './voiceModeCopy'

export type OrbPhase =
  'connecting' | 'reconnecting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'off'

/** What the orb reads every frame: real audio levels and whether the coach is due to answer. */
export type OrbSample = () => {
  input: number
  output: number
  speaking: boolean
  awaiting: boolean
}

/** A hand-drawn circle: a smooth closed curve whose radius wobbles a little (deterministic). */
function wobble(radius: number, seed: number, points = 9, amount = 0.045) {
  const at = (index: number): [number, number] => {
    const i = ((index % points) + points) % points
    const angle = (i / points) * Math.PI * 2
    const r = radius * (1 + amount * Math.sin(seed * 12.9898 + i * 78.233))
    return [Math.cos(angle) * r, Math.sin(angle) * r]
  }
  const [x0, y0] = at(0)
  let d = `M${x0.toFixed(1)} ${y0.toFixed(1)}`
  for (let i = 0; i < points; i++) {
    const [ax, ay] = at(i - 1)
    const [bx, by] = at(i)
    const [cx, cy] = at(i + 1)
    const [dx, dy] = at(i + 2)
    const c1 = [bx + (cx - ax) / 6, by + (cy - ay) / 6].map((n) => n.toFixed(1)).join(' ')
    const c2 = [cx - (dx - bx) / 6, cy - (dy - by) / 6].map((n) => n.toFixed(1)).join(' ')
    d += ` C${c1} ${c2} ${cx.toFixed(1)} ${cy.toFixed(1)}`
  }
  return `${d}Z`
}
const RING_A = wobble(74, 1)
const RING_B = wobble(80, 2, 11, 0.03)
const RING_C = wobble(66, 3, 8, 0.06)
const CORE = wobble(46, 4, 10, 0.05)

/**
 * The coach, as a piece of chalk on the board. It listens (mint, ripples with the owner's
 * voice), thinks (lilac, a ring being drawn over and over), speaks (sunflower, the core swells
 * with the coach's real voice), reconnects (sky, a dashed ring turning) or rests (paused/off).
 * Levels come from the live audio every frame and are written to a CSS variable, so React never
 * re-renders per frame. With reduced motion it keeps colour and shape only.
 */
export function VoiceOrb({
  base,
  sample,
  onPhase,
  reducedMotion,
  size,
}: {
  base: OrbPhase
  sample: OrbSample
  onPhase: (phase: OrbPhase) => void
  reducedMotion: boolean
  size: { xs: number | string; md?: number | string }
}) {
  const theme = useTheme()
  const roles = theme.material
  const chalk = theme.chalk
  const root = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<OrbPhase>(base)
  const live = useRef({ base, sample, onPhase, reducedMotion })
  useEffect(() => {
    live.current = { base, sample, onPhase, reducedMotion }
  })
  useEffect(() => {
    let frame = 0
    let current: OrbPhase | '' = ''
    let smooth = 0
    let quietSince = 0
    const tick = (now: number) => {
      const { base, sample, onPhase, reducedMotion } = live.current
      const s = sample()
      let next: OrbPhase = base
      if (s.speaking && base !== 'connecting' && base !== 'reconnecting') next = 'speaking'
      else if (base === 'listening' && s.awaiting) {
        // The owner has stopped talking and the coach is due: it is thinking.
        if (s.input > 0.08) quietSince = now
        if (now - quietSince > 600) next = 'thinking'
      } else quietSince = now
      if (next !== current) {
        current = next
        setPhase(next)
        onPhase(next)
      }
      const target =
        next === 'speaking'
          ? s.output || 0.28 + 0.22 * Math.abs(Math.sin(now / 140) * Math.sin(now / 410))
          : next === 'listening'
            ? s.input
            : next === 'thinking'
              ? 0.12 + 0.06 * Math.sin(now / 300)
              : 0
      smooth += (target - smooth) * (target > smooth ? 0.35 : 0.1)
      root.current?.style.setProperty('--lvl', reducedMotion ? '0' : smooth.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const tone =
    phase === 'listening'
      ? chalk.mint
      : phase === 'speaking'
        ? chalk.sunflower
        : phase === 'thinking'
          ? chalk.lilac
          : phase === 'connecting' || phase === 'reconnecting'
            ? chalk.sky
            : null
  const stroke = tone?.main ?? roles.outline
  const fill = tone?.container ?? roles.surfaceContainerHighest
  const ink = tone?.onContainer ?? roles.onSurfaceVariant
  const icon =
    phase === 'paused' ? (
      <MicOff size={30} />
    ) : phase === 'off' ? (
      <Keyboard size={28} />
    ) : phase === 'reconnecting' ? (
      <RefreshCw size={26} />
    ) : null
  const ease = motion.easing.standard
  return (
    <Box
      ref={root}
      data-testid="voice-orb"
      data-phase={phase}
      aria-hidden="true"
      sx={{
        '--lvl': 0,
        position: 'relative',
        flexShrink: 0,
        transition: `width 500ms ${ease}, height 500ms ${ease}`,
        width: { xs: size.xs, md: size.md ?? size.xs },
        height: { xs: size.xs, md: size.md ?? size.xs },
        '& > svg': { display: 'block', width: '100%', height: '100%', overflow: 'visible' },
        '& .stroke': { transition: `stroke 500ms ${ease}` },
        '& .aura': {
          transformBox: 'fill-box',
          transformOrigin: 'center',
          transform: 'scale(calc(0.8 + var(--lvl) * 0.45))',
          transition: `fill 500ms ${ease}`,
        },
        '& .core': {
          transformBox: 'fill-box',
          transformOrigin: 'center',
          transform: 'scale(calc(0.9 + var(--lvl) * 0.38))',
          transition: `fill 500ms ${ease}, stroke 500ms ${ease}`,
        },
        '& .rings': { transformBox: 'fill-box', transformOrigin: 'center' },
        '& .ring': { transformBox: 'fill-box', transformOrigin: 'center', fill: 'none' },
        '& .ripple': {
          transformBox: 'fill-box',
          transformOrigin: 'center',
          fill: 'none',
          opacity: 0,
        },
        '& .dot': { opacity: 0 },
        '@keyframes orbSpin': { to: { transform: 'rotate(360deg)' } },
        '@keyframes orbSpinBack': { to: { transform: 'rotate(-360deg)' } },
        '@keyframes orbRipple': {
          from: { transform: 'scale(0.75)', opacity: 0.55 },
          to: { transform: 'scale(1.45)', opacity: 0 },
        },
        '@keyframes orbDraw': {
          from: { strokeDashoffset: 470 },
          to: { strokeDashoffset: -470 },
        },
        '@keyframes orbBreathe': { '50%': { transform: 'scale(1.06)' } },
        '@keyframes orbDot': {
          '0%, 100%': { opacity: 0.25, transform: 'translateY(0)' },
          '50%': { opacity: 1, transform: 'translateY(-5px)' },
        },
        '@keyframes orbFade': { '50%': { opacity: 0.45 } },
        // Rings drift always (slowly), each at its own pace: chalk never sits perfectly still.
        '& .ring-a': { animation: 'orbSpin 26s linear infinite' },
        '& .ring-b': { animation: 'orbSpinBack 34s linear infinite', strokeDasharray: '2 9' },
        '& .ring-c': { animation: 'orbSpin 19s linear infinite' },
        '&[data-phase="listening"] .ripple': {
          animation: `orbRipple 2.2s ${motion.easing.emphasizedDecelerate} infinite`,
        },
        '&[data-phase="listening"] .ripple-2': { animationDelay: '1.1s' },
        '&[data-phase="listening"] .ripples': { opacity: 'calc(0.35 + var(--lvl) * 1.6)' },
        '&[data-phase="thinking"] .ring-a': {
          strokeDasharray: '120 350',
          animation: 'orbDraw 1.6s ease-in-out infinite',
        },
        '&[data-phase="thinking"] .core': { animation: 'orbBreathe 1.8s ease-in-out infinite' },
        '&[data-phase="thinking"] .dot': {
          opacity: 0.8,
          animation: 'orbDot 1.1s ease-in-out infinite',
        },
        '&[data-phase="thinking"] .dot-2': { animationDelay: '0.18s' },
        '&[data-phase="thinking"] .dot-3': { animationDelay: '0.36s' },
        '&[data-phase="speaking"] .rings': {
          transform: 'scale(calc(1 + var(--lvl) * 0.12))',
        },
        '&[data-phase="connecting"] .ring-a, &[data-phase="reconnecting"] .ring-a': {
          strokeDasharray: '14 12',
          animation: 'orbSpin 2.4s linear infinite',
        },
        '&[data-phase="connecting"] .core, &[data-phase="reconnecting"] .core': {
          animation: 'orbFade 1.6s ease-in-out infinite',
        },
        '&[data-phase="paused"] .core, &[data-phase="off"] .core': { fillOpacity: 0.5 },
        '&[data-phase="paused"] .ring-c, &[data-phase="off"] .ring-c': { opacity: 0 },
        '&[data-phase="reconnecting"] .glyph svg': { animation: 'orbSpin 1.4s linear infinite' },
      }}
    >
      <svg viewBox="0 0 200 200">
        <defs>
          {/* A chalky edge: strokes broken up a little like chalk on a board. */}
          <filter id="orb-chalk" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="2.2" />
          </filter>
          <radialGradient id="orb-aura">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
            <stop offset="70%" stopColor={stroke} stopOpacity="0.08" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform="translate(100 100)">
          <circle className="aura" r="98" fill="url(#orb-aura)" />
          <g className="ripples">
            <circle className="ripple ripple-1 stroke" r="62" stroke={stroke} strokeWidth="2" />
            <circle className="ripple ripple-2 stroke" r="62" stroke={stroke} strokeWidth="2" />
          </g>
          <g className="rings" filter="url(#orb-chalk)">
            <path className="ring ring-a stroke" d={RING_A} stroke={stroke} strokeWidth="3" />
            <path className="ring ring-b stroke" d={RING_B} stroke={stroke} strokeWidth="2" />
            <path
              className="ring ring-c stroke"
              d={RING_C}
              stroke={stroke}
              strokeWidth="1.6"
              strokeOpacity="0.6"
            />
          </g>
          <path
            className="core"
            d={CORE}
            fill={fill}
            stroke={stroke}
            strokeWidth="2.5"
            filter="url(#orb-chalk)"
          />
          <g fill={ink}>
            <circle className="dot dot-1" cx="-14" cy="0" r="4.5" />
            <circle className="dot dot-2" cx="0" cy="0" r="4.5" />
            <circle className="dot dot-3" cx="14" cy="0" r="4.5" />
          </g>
        </g>
      </svg>
      {icon && (
        <Box
          className="glyph"
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: ink,
          }}
        >
          {icon}
        </Box>
      )}
    </Box>
  )
}

type Draft = { business: Business['fields'] | null; products: Product[] }

/** Each piece arrives like chalk pressed onto the board: a small stamp, a short glow. */
const fillIn = {
  '@keyframes shopFillIn': {
    '0%': { opacity: 0, transform: 'scale(0.7) rotate(-5deg)' },
    '60%': { opacity: 1, transform: 'scale(1.06) rotate(1deg)' },
    '100%': { opacity: 1, transform: 'none' },
  },
  '@keyframes shopGlow': {
    from: { boxShadow: '0 0 0 6px var(--glow)' },
    to: { boxShadow: '0 0 0 0 transparent' },
  },
  animation: `shopFillIn 520ms ${motion.easing.overshoot} both, shopGlow 1200ms ease-out 200ms both`,
}

/**
 * "Your shop so far": the shop filling up while the owner talks. Empty places are dashed chalk
 * outlines (what is still to come); each answer lands in its place with a small stamp. Phone: a
 * compact card with one scrolling row; desktop: a tall column with every item and price.
 */
export function ShopFill({
  draft,
  busy,
  onReview,
}: {
  draft: Draft
  busy: boolean
  onReview: () => void
}) {
  const t = useCopy()
  const f = useNewShopCopy()
  const v = useVoiceModeCopy()
  const theme = useTheme()
  const roles = theme.material
  const glow = theme.chalk.sunflower.container
  const business = draft.business
  const currency = business?.currency ?? defaultCurrency()
  const facts = business ? factEntries(business, t) : []
  const fact = (key: string) => facts.find((entry) => entry.key === key)?.value ?? ''
  const items = draft.products.map((p) =>
    p.price != null ? `${p.name} ${formatPrice(p.price, currency)}` : p.name,
  )
  const slots: { key: string; label: string; value: string; icon: ReactNode }[] = [
    {
      key: 'products',
      label: t.products,
      value: items.length
        ? items.slice(0, 2).join(' · ') + (items.length > 2 ? ` ${v.more(items.length - 2)}` : '')
        : '',
      icon: <ShoppingBasket size={16} />,
    },
    {
      key: 'location',
      label: t.fields.location,
      value: business
        ? business.lat != null
          ? readablePlace(business, f)
          : business.location
        : '',
      icon: <MapPin size={16} />,
    },
    {
      key: 'hours',
      label: t.fields.hours,
      value: business?.hours || (business?.weekly_hours?.length ? '✓' : ''),
      icon: <Clock size={16} />,
    },
    {
      key: 'payment',
      label: t.factNames.payment_methods,
      value: fact('payment_methods'),
      icon: <Wallet size={16} />,
    },
    {
      key: 'delivery',
      label: t.factNames.delivery,
      value: fact('delivery'),
      icon: <Bike size={16} />,
    },
    ...facts
      .filter((entry) => !['payment_methods', 'delivery'].includes(entry.key))
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        value: entry.value,
        icon: <Sparkles size={16} />,
      })),
  ]
  const done = slots.filter((slot) => slot.value).length + (business?.name ? 1 : 0)
  const total = slots.length + 1
  return (
    <Box
      component="section"
      aria-label={f.soFar}
      data-testid="shop-so-far"
      sx={{
        '--glow': glow,
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 1.5, md: 2.5 },
        p: { xs: 2.5, md: 4 },
        borderRadius: `${shape.lg}px`,
        bgcolor: roles.surfaceContainer,
        border: `1.5px dashed ${roles.outlineVariant}`,
        minHeight: 0,
        overflow: { md: 'auto' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${shape.md}px`,
            bgcolor: roles.primaryContainer,
            color: roles.onPrimaryContainer,
            transform: 'rotate(-4deg)',
          }}
        >
          <Store size={22} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="labelMedium" color="text.secondary" component="p">
            {f.soFar}
          </Typography>
          <Typography
            key={business?.name}
            component="p"
            sx={{
              fontFamily: HAND_FONT,
              fontSize: { xs: '1.55rem', md: '2.1rem' },
              lineHeight: 1.1,
              overflowWrap: 'anywhere',
              color: business?.name ? 'text.primary' : 'text.secondary',
              ...(business?.name ? chalkWrite : {}),
            }}
          >
            {business?.name || f.unnamed}
          </Typography>
          {business?.category && (
            <Typography
              key={business.category}
              variant="bodySmall"
              color="text.secondary"
              sx={{ overflowWrap: 'anywhere', ...chalkWrite }}
            >
              {business.category}
            </Typography>
          )}
        </Box>
        {/* A chalk tally of what is filled in. */}
        <Box
          aria-hidden="true"
          sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, alignSelf: 'flex-start', pt: 1 }}
        >
          {Array.from({ length: total }, (_, i) => (
            <Box
              key={i}
              sx={{
                width: 6,
                height: 14,
                borderRadius: 1,
                transform: `rotate(${i % 2 ? 6 : -4}deg)`,
                bgcolor: i < done ? roles.primary : roles.outlineVariant,
                transition: `background-color 400ms ${motion.easing.standard}`,
              }}
            />
          ))}
        </Box>
        {business?.name && (
          <Button
            variant="contained"
            disabled={busy}
            onClick={onReview}
            sx={{ flexShrink: 0, display: { xs: 'inline-flex', md: 'none' } }}
          >
            {f.review}
          </Button>
        )}
      </Box>
      {!done && (
        <Typography variant="bodySmall" color="text.secondary">
          {v.cardHint}
        </Typography>
      )}
      {/* Phone: one row of places that scrolls sideways; desktop: a list with every item. */}
      <Box
        component="ul"
        // It scrolls sideways on a phone, so keyboard users can reach it too.
        tabIndex={0}
        aria-label={f.soFar}
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'flex',
          flexDirection: { xs: 'row', md: 'column' },
          gap: { xs: 1, md: 1.5 },
          overflowX: { xs: 'auto', md: 'visible' },
          // The row scrolls sideways; its edge fades so it reads as "more this way".
          maskImage: {
            xs: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)',
            md: 'none',
          },
          scrollbarWidth: 'none',
          mx: { xs: -2.5, md: 0 },
          px: { xs: 2.5, md: 0 },
          pb: { xs: 0.5, md: 0 },
        }}
      >
        {slots.map((slot) => (
          <Box
            component="li"
            key={`${slot.key}:${slot.value ? 'on' : 'off'}`}
            data-filled={slot.value ? 'true' : 'false'}
            sx={{
              display: 'flex',
              alignItems: { xs: 'center', md: 'flex-start' },
              gap: 1,
              flexShrink: 0,
              maxWidth: { xs: 240, md: 'none' },
              minHeight: 36,
              px: 1.5,
              py: { xs: 0.75, md: 1.25 },
              borderRadius: `${shape.md}px`,
              color: slot.value ? roles.onSecondaryContainer : roles.onSurfaceVariant,
              bgcolor: slot.value ? roles.secondaryContainer : 'transparent',
              border: slot.value
                ? '1.5px solid transparent'
                : `1.5px dashed ${roles.outlineVariant}`,
              ...(slot.value ? fillIn : {}),
            }}
          >
            <Box aria-hidden="true" sx={{ display: 'flex', flexShrink: 0, pt: { md: 0.25 } }}>
              {slot.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="labelMedium"
                component="p"
                sx={{
                  display: slot.value ? { xs: 'none', md: 'block' } : 'block',
                  color: slot.value ? 'inherit' : 'text.secondary',
                  opacity: slot.value ? 0.8 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {slot.label}
              </Typography>
              {slot.value && (
                <Typography
                  variant="bodyMedium"
                  component="p"
                  sx={{
                    whiteSpace: { xs: 'nowrap', md: 'normal' },
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    overflowWrap: { md: 'anywhere' },
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
                    <Box
                      component="span"
                      sx={{
                        position: 'absolute',
                        width: 1,
                        height: 1,
                        overflow: 'hidden',
                        clip: 'rect(0 0 0 0)',
                      }}
                    >
                      {slot.label}:{' '}
                    </Box>
                  </Box>
                  {slot.key === 'products' ? (
                    <>
                      <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
                        {slot.value}
                      </Box>
                      <Box
                        component="span"
                        sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column' }}
                      >
                        {draft.products.map((p, i) => (
                          <Box
                            component="span"
                            key={`${p.name}|${p.unit}`}
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 2,
                              ...chalkWrite,
                              animationDelay: `${Math.min(i, 6) * 60}ms`,
                            }}
                          >
                            <span>{p.name}</span>
                            {p.price != null && (
                              <Box
                                component="span"
                                sx={{
                                  fontFamily: HAND_FONT,
                                  fontSize: '1.15rem',
                                  lineHeight: 1.2,
                                  flexShrink: 0,
                                }}
                              >
                                {formatPrice(p.price, currency)}
                              </Box>
                            )}
                          </Box>
                        ))}
                      </Box>
                    </>
                  ) : (
                    slot.value
                  )}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>
      {business?.name && (
        <Button
          variant="contained"
          size="large"
          disabled={busy}
          onClick={onReview}
          sx={{
            display: { xs: 'none', md: 'inline-flex' },
            mt: 'auto',
            minHeight: 52,
            borderRadius: `${shape.full}px`,
          }}
        >
          {f.review}
        </Button>
      )}
    </Box>
  )
}

/**
 * Every voice failure as one calm, dismissible alert in the page (never a modal): what happened,
 * what to do, and the right buttons. Typing keeps working underneath the whole time.
 */
export function VoiceAlert({
  problem,
  onRetry,
  onType,
  onClose,
}: {
  problem: VoiceProblem
  onRetry: () => void
  onType: () => void
  onClose: () => void
}) {
  const v = useVoiceModeCopy()
  const [wait, setWait] = useState(problem.kind === 'rate-limited' ? problem.seconds : 0)
  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])
  const [title, body, retry] =
    problem.kind === 'mic-blocked'
      ? [v.micBlockedTitle, v.micBlockedBody, v.tryAgain]
      : problem.kind === 'no-mic'
        ? [v.noMicTitle, v.noMicBody, v.tryAgain]
        : problem.kind === 'connection'
          ? [v.connectionTitle, v.connectionBody, v.reconnect]
          : problem.kind === 'rate-limited'
            ? [v.rateTitle, v.rateBody(Math.max(wait, 0)), v.tryAgain]
            : [v.unavailableTitle, v.unavailableBody, v.tryAgain]
  return (
    <Alert
      data-testid="voice-alert"
      data-problem={problem.kind}
      severity={
        problem.kind === 'unavailable' || problem.kind === 'rate-limited' ? 'info' : 'warning'
      }
      onClose={onClose}
      closeText={v.close}
      sx={{
        borderRadius: `${shape.lg}px`,
        // On a phone the words and both buttons get the full width.
        '& .MuiAlert-icon': { display: { xs: 'none', sm: 'flex' } },
        '@keyframes alertIn': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'none' },
        },
        animation: `alertIn ${motion.duration.enter}ms ${motion.easing.emphasizedDecelerate} both`,
      }}
    >
      <AlertTitle>{title}</AlertTitle>
      <Typography variant="bodyMedium">{body}</Typography>
      <Stack direction="row" sx={{ gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="small"
          disabled={problem.kind === 'rate-limited' && wait > 0}
          onClick={onRetry}
        >
          {retry}
        </Button>
        {problem.kind !== 'unavailable' && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<Keyboard size={16} />}
            onClick={onType}
          >
            {v.typeInstead}
          </Button>
        )}
      </Stack>
    </Alert>
  )
}
