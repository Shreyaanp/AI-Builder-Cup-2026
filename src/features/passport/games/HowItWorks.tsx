import { useId, useState } from 'react'
import { Box, Button, Dialog, Stack, Typography, useTheme } from '@mui/material'
import {
  CalendarCheck,
  CircleHelp,
  Flame,
  Gift,
  Hand,
  HeartHandshake,
  type LucideIcon,
  MapPin,
  Plane,
  QrCode,
  Snowflake,
  Stamp,
  Sticker as StickerIcon,
  Trophy,
  Users,
} from 'lucide-react'
import type { FeatureKey } from '../../../design/chalkboard'
import { dealIn } from '../../../design/chalkMotion'
import { HAND_FONT } from '../../../design/theme'
import { fill } from '../copy'
import { useGamesCopy } from './copy'
import type { GamesStrings } from './copy'

export type Game = 'scratch' | 'card' | 'streak' | 'sets' | 'coop'

/** Each game's colour and the picture for each of its 3 steps. */
const GAMES: Record<Game, { tone: FeatureKey; icons: [LucideIcon, LucideIcon, LucideIcon] }> = {
  scratch: { tone: 'sunflower', icons: [QrCode, Hand, Gift] },
  card: { tone: 'mint', icons: [Stamp, CalendarCheck, Gift] },
  streak: { tone: 'coral', icons: [Flame, Snowflake, Plane] },
  sets: { tone: 'lilac', icons: [StickerIcon, MapPin, Trophy] },
  coop: { tone: 'sky', icons: [Users, HeartHandshake, Trophy] },
}

function steps(game: Game, t: GamesStrings) {
  const key = (suffix: string) => t[`how_${game}_${suffix}` as keyof GamesStrings]
  return [1, 2, 3].map((n) => ({ title: key(String(n)), body: key(`${n}b`) }))
}

/** A one-glance "how it works": 3 illustrated steps, opened from a small help button. */
export function HowItWorks({ game, label }: { game: Game; label?: string }) {
  const t = useGamesCopy()
  const theme = useTheme()
  const roles = theme.material
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const title = t[`how_${game}` as keyof GamesStrings]
  const { tone, icons } = GAMES[game]
  const colour = theme.chalk[tone]
  return (
    <>
      <Button
        size="small"
        startIcon={<CircleHelp size={18} aria-hidden="true" />}
        onClick={() => setOpen(true)}
        aria-label={fill(t.howItWorksFor, { title })}
        sx={{ minHeight: 40, color: 'inherit', flexShrink: 0 }}
      >
        {label ?? t.howItWorks}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby={titleId}
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: '28px',
            bgcolor: roles.surfaceContainerLow,
            m: 2,
            width: 'calc(100% - 32px)',
          },
        }}
      >
        <Box sx={{ p: 5 }}>
          <Typography variant="labelLarge" sx={{ color: colour.main }}>
            {t.howItWorks}
          </Typography>
          <Typography
            id={titleId}
            component="h2"
            sx={{ fontFamily: HAND_FONT, fontWeight: 700, fontSize: 34, lineHeight: 1.15 }}
          >
            {title}
          </Typography>
          <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, mt: 4, position: 'relative' }}>
            {/* The chalk line that joins the three steps. */}
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                left: 27,
                top: 28,
                bottom: 28,
                borderLeft: `3px dashed ${colour.main}`,
                opacity: 0.5,
              }}
            />
            {steps(game, t).map((step, index) => {
              const Icon = icons[index]!
              return (
                <Stack
                  component="li"
                  key={index}
                  direction="row"
                  sx={{
                    gap: 3,
                    alignItems: 'flex-start',
                    position: 'relative',
                    pb: index < 2 ? 4 : 0,
                    ...dealIn,
                    '--deal-index': index,
                    '--deal-tilt': '0deg',
                  }}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 56,
                      height: 56,
                      flexShrink: 0,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: colour.container,
                      color: colour.onContainer,
                      border: `3px solid ${roles.surfaceContainerLow}`,
                      position: 'relative',
                    }}
                  >
                    <Icon size={26} strokeWidth={2.2} />
                    <Box
                      component="span"
                      sx={{
                        position: 'absolute',
                        right: -6,
                        bottom: -6,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: colour.main,
                        color: colour.onMain,
                        typography: 'labelMedium',
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}
                    </Box>
                  </Box>
                  <Box sx={{ minWidth: 0, pt: 0.5 }}>
                    <Typography component="h3" variant="titleMedium" sx={{ fontWeight: 700 }}>
                      <Box component="span" sx={visuallyHidden}>
                        {fill(t.step, { n: index + 1 })}:{' '}
                      </Box>
                      {step.title}
                    </Typography>
                    <Typography variant="bodyMedium" color="text.secondary">
                      {step.body}
                    </Typography>
                  </Box>
                </Stack>
              )
            })}
          </Box>
          <Button variant="contained" fullWidth sx={{ mt: 5 }} onClick={() => setOpen(false)}>
            {t.gotIt}
          </Button>
        </Box>
      </Dialog>
    </>
  )
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const
