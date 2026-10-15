import { Box, useTheme } from '@mui/material'
import { Leaf, PencilLine, Star } from 'lucide-react'
import type { FeatureKey } from '../../design/chalkboard'
import { HAND_FONT } from '../../design/theme'

import { CATEGORY_ICONS, FESTIVAL_ART, categoryArt, seed } from './artData'

const TONES: FeatureKey[] = ['sunflower', 'mint', 'coral', 'sky', 'lilac']

/**
 * A die-cut sticker stamp (Direction 2 touch): a scalloped chalk-colour badge with a white cut
 * edge, slightly tilted like it was pressed by hand. Purely decorative; callers label it.
 */
export function Sticker({
  id,
  category = '',
  kind = 'visit',
  size = 72,
  tone,
  ghost = false,
  festival,
}: {
  id: string
  category?: string
  kind?: 'visit' | 'first' | 'rescue' | 'tip'
  size?: number
  tone?: FeatureKey
  ghost?: boolean
  festival?: keyof typeof FESTIVAL_ART | null
}) {
  const theme = useTheme()
  const roles = theme.material
  const hash = seed(id)
  const chosen =
    tone ?? (kind === 'rescue' ? 'coral' : kind === 'tip' ? 'sky' : TONES[hash % TONES.length]!)
  const colour = theme.chalk[chosen]
  const Icon = festival
    ? FESTIVAL_ART[festival]
    : kind === 'rescue'
      ? Leaf
      : kind === 'tip'
        ? PencilLine
        : CATEGORY_ICONS[categoryArt(category)]
  const tilt = ((hash % 15) - 7) * 1.2
  // Scalloped edge: 14 bumps around the circle.
  const bumps = 14
  const path = Array.from({ length: bumps * 2 }, (_, i) => {
    const angle = (Math.PI * i) / bumps
    const radius = i % 2 ? 44 : 48
    return `${i ? 'L' : 'M'}${50 + radius * Math.cos(angle)},${50 + radius * Math.sin(angle)}`
  }).join(' ')
  if (ghost)
    return (
      <Box
        aria-hidden="true"
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `2px dashed ${roles.outlineVariant}`,
          opacity: 0.8,
        }}
      />
    )
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        position: 'relative',
        transform: `rotate(${tilt}deg)`,
        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.22))',
      }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <path d={`${path} Z`} fill="#FFFFFF" />
        <circle cx="50" cy="50" r="39" fill={colour.container} />
        <circle
          cx="50"
          cy="50"
          r="33"
          fill="none"
          stroke={colour.main}
          strokeWidth="2.5"
          strokeDasharray={kind === 'first' ? undefined : '4 3'}
        />
        {kind === 'first' && (
          <circle cx="50" cy="50" r="42" fill="none" stroke="#D4A017" strokeWidth="3" />
        )}
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          color: colour.onContainer,
        }}
      >
        <Icon size={size * 0.38} strokeWidth={2.2} />
      </Box>
      {kind === 'first' && (
        <Box
          sx={{
            position: 'absolute',
            right: -2,
            top: -2,
            color: '#D4A017',
            display: 'grid',
          }}
        >
          <Star size={size * 0.28} fill="currentColor" />
        </Box>
      )}
    </Box>
  )
}

/** Progress toward the next level as a chalk ring; the number in the middle is hand-written. */
export function LevelRing({
  value,
  label,
  size = 132,
}: {
  /** 0..1 */
  value: number
  label: string
  size?: number
}) {
  const theme = useTheme()
  const tone = theme.chalk.sunflower
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const done = Math.max(0, Math.min(1, value))
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 132 132" width={size} height={size} aria-hidden="true">
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke={theme.material.surfaceContainerHighest}
          strokeWidth="12"
        />
        <circle
          className="level-ring"
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke={tone.main}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - done)}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          fontFamily: HAND_FONT,
          fontWeight: 700,
          fontSize: size * 0.27,
          lineHeight: 1,
          color: theme.material.onSurface,
        }}
      >
        {label}
      </Box>
    </Box>
  )
}
