import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { ArrowRight, Gift, Ticket } from 'lucide-react'
import { dealIn } from '../../../design/chalkMotion'
import { HAND_FONT } from '../../../design/theme'
import { useLocale } from '../../../state/hooks'
import { customerNavigate } from '../../frontdoors/navigation'
import { fill, usePassportCopy } from '../copy'
import type { PassportView } from '../store'
import { useGames } from './api'
import { useGamesCopy } from './copy'
import { Flame } from './StreakFlame'
import { nextRewardText } from './words'

/** "Next reward" as a ribbon: the named reward, and where. */
export function NextRewardLine({ view }: { view: PassportView }) {
  const t = useGamesCopy()
  const p = usePassportCopy()
  const locale = useLocale()
  const theme = useTheme()
  const tone = theme.chalk.mint
  const next = view.games?.next_reward
  if (!next) return null
  const number = (n: number) => new Intl.NumberFormat(locale).format(n)
  const text = nextRewardText(next, view, t, p, number)
  if (!text) return null
  return (
    <Stack
      direction="row"
      sx={{
        p: 3,
        gap: 2,
        alignItems: 'center',
        borderRadius: '20px',
        bgcolor: tone.container,
        color: tone.onContainer,
        ...dealIn,
      }}
    >
      <Gift size={28} aria-hidden="true" />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="labelLarge">{t.nextReward}</Typography>
        <Typography variant="titleMedium" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
          {text}
        </Typography>
        {next.kind === 'card' && next.shop_name && (
          <Typography variant="bodySmall">
            {fill(t.nextCardAt, { shop: next.shop_name.replace(/\s*\(Demo\)$/, '') })}
          </Typography>
        )}
      </Box>
    </Stack>
  )
}

/**
 * The front door's games entry point (docs/handoff/customer-games.md): a compact card with the
 * next named reward, the streak flame and any scratch cards waiting, linking to the passport.
 * Renders nothing until the passport has loaded, so it never pushes the page around.
 */
export function GamesCard({ place }: { place?: { lat: number; lng: number } | null }) {
  const t = useGamesCopy()
  const p = usePassportCopy()
  const locale = useLocale()
  const theme = useTheme()
  const gold = theme.chalk.sunflower
  const { passport, next, scratch, streak } = useGames(place)
  if (!passport) return null
  const number = (n: number) => new Intl.NumberFormat(locale).format(n)
  const text = next ? nextRewardText(next, passport, t, p, number) : ''
  const weeks = streak?.weeks ?? 0
  return (
    <Box
      component="section"
      aria-label={t.gamesCard}
      sx={{
        p: 3,
        borderRadius: '24px',
        bgcolor: gold.container,
        color: gold.onContainer,
        ...dealIn,
      }}
    >
      <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
        <Flame lit={weeks > 0} size={36} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" variant="labelLarge">
            {t.gamesCard}
          </Typography>
          <Typography
            sx={{ fontFamily: HAND_FONT, fontWeight: 700, fontSize: 24, lineHeight: 1.15 }}
          >
            {text || fill(p.streak, { n: number(weeks) })}
          </Typography>
          {scratch.length > 0 && (
            <Stack direction="row" sx={{ gap: 1, alignItems: 'center', mt: 0.5 }}>
              <Ticket size={16} aria-hidden="true" />
              <Typography variant="labelLarge">
                {fill(t.scratchWaiting, { n: number(scratch.length) })}
              </Typography>
            </Stack>
          )}
        </Box>
      </Stack>
      <Button
        component="a"
        href="/explore/passport"
        onClick={customerNavigate}
        variant="contained"
        endIcon={<ArrowRight size={18} />}
        sx={{ mt: 2 }}
      >
        {t.openPassport}
      </Button>
    </Box>
  )
}
