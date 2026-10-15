import { useRef } from 'react'
import { Box, Chip, Stack, Typography, useTheme } from '@mui/material'
import { gsap } from 'gsap'
import { Check, Coffee, HandHeart, Moon, type LucideIcon } from 'lucide-react'
import type { FeatureKey } from '../../../design/chalkboard'
import { dealIn, useChalkTimeline } from '../../../design/chalkMotion'
import { HAND_FONT } from '../../../design/theme'
import { useLocale } from '../../../state/hooks'
import { FESTIVAL_ART } from '../artData'
import { fill, usePassportCopy } from '../copy'
import type { PassportStrings } from '../copy'
import { customerNavigate } from '../../frontdoors/navigation'
import type { SetView } from './api'
import { useGamesCopy } from './copy'
import type { GamesStrings } from './copy'
import { HowItWorks } from './HowItWorks'
import { setName } from './words'

const SET_ART: Record<string, { icon: LucideIcon; tone: FeatureKey }> = {
  chai_trail: { icon: Coffee, tone: 'sunflower' },
  locally_made: { icon: HandHeart, tone: 'mint' },
  night_market: { icon: Moon, tone: 'lilac' },
}

function art(set: Pick<SetView, 'id' | 'art'>) {
  const known = SET_ART[set.id]
  if (known) return known
  const icon = FESTIVAL_ART[set.art as keyof typeof FESTIVAL_ART] ?? Coffee
  return { icon, tone: 'coral' as FeatureKey }
}

function setBody(set: SetView, t: GamesStrings, p: PassportStrings) {
  if (set.festival) return fill(p.festivalBody, { n: set.need })
  return (t[`${set.id}Body` as keyof GamesStrings] as string | undefined) ?? ''
}

/** A set's badge: the set's picture on a die-cut disc, gold-rimmed once complete. */
export function SetBadge({
  set,
  size = 64,
}: {
  set: Pick<SetView, 'id' | 'art' | 'done'>
  size?: number
}) {
  const theme = useTheme()
  const { icon: Icon, tone } = art(set)
  const colour = theme.chalk[tone]
  return (
    <Box
      aria-hidden="true"
      className="set-badge"
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        bgcolor: set.done ? colour.main : colour.container,
        color: set.done ? colour.onMain : colour.onContainer,
        boxShadow: set.done
          ? `0 0 0 4px #FFFFFF, 0 0 0 7px #D4A017, 0 3px 6px rgba(0,0,0,0.25)`
          : `0 0 0 3px #FFFFFF, 0 2px 4px rgba(0,0,0,0.18)`,
      }}
    >
      <Icon size={size * 0.46} strokeWidth={2.2} />
      {set.done && (
        <Box
          sx={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: size * 0.36,
            height: size * 0.36,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: '#D4A017',
            color: '#241A00',
          }}
        >
          <Check size={size * 0.22} strokeWidth={3} />
        </Box>
      )}
    </Box>
  )
}

/** The completion moment: the badge flips over in 3D and lands (stamp moment, set card). */
export function SetComplete({ set }: { set: Pick<SetView, 'id' | 'art'> }) {
  const t = useGamesCopy()
  const p = usePassportCopy()
  const scope = useRef<HTMLDivElement>(null)
  useChalkTimeline(scope, (root) => {
    gsap.fromTo(
      root.querySelector('.set-badge'),
      { rotateY: 180, scale: 0.6, opacity: 0 },
      { rotateY: 0, scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.8)', delay: 0.4 },
    )
  })
  return (
    <Stack
      ref={scope}
      direction="row"
      className="stamp-line"
      sx={{ alignItems: 'center', gap: 2, justifyContent: 'center', perspective: '600px' }}
    >
      <SetBadge set={{ ...set, done: true }} size={48} />
      <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
        {fill(t.setComplete, { set: setName(set.id, t, p) })}
      </Typography>
    </Stack>
  )
}

/**
 * Collection sets (docs/research/gamification.md §4): themed sets of different shops, each with
 * its stickers, the next stop named, and a badge plus a shop perk when complete.
 */
export function CollectionSets({ sets }: { sets: SetView[] }) {
  const t = useGamesCopy()
  const p = usePassportCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
      new Date(`${iso}T12:00:00`),
    )
  // Festival trails first (limited time), then sets in progress, then complete ones.
  const ordered = [...sets].sort(
    (a, b) =>
      Number(Boolean(b.festival)) - Number(Boolean(a.festival)) ||
      Number(a.done) - Number(b.done) ||
      b.have / b.need - a.have / a.need,
  )
  return (
    <Box component="section" aria-label={t.setsTitle}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography component="h2" variant="titleLarge" sx={{ flex: 1 }}>
          {t.setsTitle}
        </Typography>
        <HowItWorks game="sets" />
      </Stack>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          p: 0,
          m: 0,
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
        }}
      >
        {ordered.map((set, index) => {
          const { tone } = art(set)
          const colour = theme.chalk[tone]
          const name = setName(set.id, t, p)
          const next = set.stops?.find((stop) => !stop.done)
          return (
            <Box
              component="li"
              key={set.id}
              sx={{
                p: 4,
                borderRadius: '24px',
                bgcolor: set.done ? colour.container : roles.surfaceContainerLow,
                color: set.done ? colour.onContainer : roles.onSurface,
                border: set.done ? 'none' : `1px solid ${roles.outlineVariant}`,
                ...dealIn,
                '--deal-index': index,
              }}
            >
              <Stack direction="row" sx={{ gap: 3, alignItems: 'center' }}>
                <SetBadge set={set} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    component="h3"
                    sx={{ fontFamily: HAND_FONT, fontWeight: 700, fontSize: 28, lineHeight: 1.1 }}
                  >
                    {name}
                  </Typography>
                  <Typography variant="bodyMedium" sx={{ opacity: 0.85 }}>
                    {setBody(set, t, p)}
                  </Typography>
                </Box>
              </Stack>
              {/* One sticker slot per stop. */}
              <Stack
                direction="row"
                role="img"
                aria-label={fill(p.questProgress, { have: set.have, need: set.need })}
                sx={{ mt: 3, gap: 1.5, flexWrap: 'wrap' }}
              >
                {Array.from({ length: set.need }, (_, slot) => (
                  <Box
                    key={slot}
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: slot < set.have ? colour.main : 'transparent',
                      color: colour.onMain,
                      border: slot < set.have ? 'none' : `2px dashed ${roles.outline}`,
                      transform: `rotate(${((slot * 37) % 15) - 7}deg)`,
                    }}
                  >
                    {slot < set.have && <Check size={18} aria-hidden="true" />}
                  </Box>
                ))}
              </Stack>
              <Typography variant="labelLarge" sx={{ mt: 2, display: 'block' }}>
                {set.done ? t.setDone : fill(p.questProgress, { have: set.have, need: set.need })}
              </Typography>
              {!set.done && (
                <Typography variant="bodySmall" sx={{ mt: 0.5, opacity: 0.85 }}>
                  {set.festival
                    ? fill(p.questReward, { n: set.points })
                    : fill(t.setReward, { n: set.points })}
                </Typography>
              )}
              {set.ends && (
                <Typography variant="bodySmall" sx={{ mt: 0.5, opacity: 0.85 }}>
                  {fill(t.setEnds, { date: date(set.ends) })}
                </Typography>
              )}
              {!set.done && (set.stops?.length ?? 0) > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="labelMedium" sx={{ opacity: 0.8 }}>
                    {t.setStops}
                  </Typography>
                  <Stack direction="row" sx={{ mt: 1, gap: 1, flexWrap: 'wrap' }}>
                    {(set.stops ?? []).slice(0, 4).map((stop) => (
                      <Chip
                        key={stop.shop_id}
                        component="a"
                        href={`/explore/s/${stop.shop_id}`}
                        onClick={customerNavigate}
                        clickable
                        variant={stop === next ? 'filled' : 'outlined'}
                        icon={stop.done ? <Check size={14} /> : undefined}
                        label={stop.name.replace(/\s*\(Demo\)$/, '')}
                        sx={{ minHeight: 36, maxWidth: '100%' }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
