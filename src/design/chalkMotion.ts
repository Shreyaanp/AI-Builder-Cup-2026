import { useLayoutEffect, type RefObject } from 'react'
import { gsap } from 'gsap'
import { motion } from './theme'

/**
 * Chalkboard motion. Rules: animate transform/opacity/
 * clip-path/stroke only, ≤ 1 reward animation at a time, never block input, and respect reduced
 * motion. The global CSS rule only stops CSS animations, so every GSAP timeline goes through
 * `useChalkTimeline`, which runs nothing when the person prefers reduced motion.
 */
export function useChalkTimeline(
  scope: RefObject<HTMLElement | null>,
  build: (root: HTMLElement) => void,
  deps: unknown[] = [],
) {
  useLayoutEffect(() => {
    const root = scope.current
    if (!root) return
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => build(root), root)
      return () => context.revert()
    })
    return () => media.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Cards dealt onto the table: rise, straighten from a slight tilt. Use with `--deal-index`.
 * The rise stays under the 24 px reading gap above fixed bars, so a card mid-deal never touches one (OB-92). */
export const dealIn = {
  '@keyframes chalkDealIn': {
    from: { opacity: 0, transform: 'translateY(12px) rotate(var(--deal-tilt, -3deg))' },
    to: { opacity: 1, transform: 'none' },
  },
  animation: `chalkDealIn 450ms ${motion.easing.emphasizedDecelerate} both`,
  animationDelay: 'calc(var(--deal-index, 0) * 70ms)',
}

/** A value written in chalk, left to right (prices, counts, titles). */
export const chalkWrite = {
  '@keyframes chalkWrite': {
    from: { clipPath: 'inset(0 100% 0 0)', opacity: 0.4 },
    to: { clipPath: 'inset(0 0 0 0)', opacity: 1 },
  },
  animation: `chalkWrite 450ms ${motion.easing.emphasizedDecelerate} both`,
}

/** A stamp landing: drop from above with a twist, then settle past the mark. */
export const stampThud = {
  '@keyframes chalkStamp': {
    '0%': { opacity: 0, transform: 'scale(1.8) rotate(-12deg)' },
    '45%': { opacity: 1, transform: 'scale(0.92) rotate(-4deg)' },
    '100%': { opacity: 1, transform: 'scale(1) rotate(-4deg)' },
  },
  animation: `chalkStamp 420ms ${motion.easing.overshoot} both`,
}

/** A small celebratory pop for toggles that matter (follow, save, check). */
export const popIn = {
  '@keyframes chalkPop': {
    '0%': { transform: 'scale(1)' },
    '40%': { transform: 'scale(1.25)' },
    '100%': { transform: 'scale(1)' },
  },
  animation: `chalkPop 380ms ${motion.easing.overshoot}`,
}
