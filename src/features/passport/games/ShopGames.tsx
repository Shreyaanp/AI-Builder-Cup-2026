import { useEffect, useId, useState } from 'react'
import { Box, Button, Chip, Collapse, Stack, Typography, useTheme } from '@mui/material'
import { Gift, Users } from 'lucide-react'
import { useLocale } from '../../../state/hooks'
import { fill, usePassportCopy } from '../copy'
import { shopGames } from './api'
import type { PerkTrigger, ShopGames as Facts } from './api'
import { useGamesCopy } from './copy'
import { HowItWorks } from './HowItWorks'
import { PERKS_SHOWN, repeatsCondition } from './perks'

// The order a customer meets them: first visits, then habits, then prizes.
const ORDER: PerkTrigger[] = [
  'third_visit',
  'tip',
  'follow',
  'regular',
  'full_card',
  'quest_finale',
  'rescue_hero',
  'set_complete',
  'scratch',
]

/**
 * A shop's games on its page: how many neighbours tried it (aggregate, from 3 people), the
 * thank-yous the owner offers (reciprocity), and this shop's scratch-card odds.
 */
export function ShopGames({ shop }: { shop: string }) {
  const t = useGamesCopy()
  const p = usePassportCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const [facts, setFacts] = useState<{ shop: string; data: Facts } | null>(null)
  const [showOdds, setShowOdds] = useState(false)
  const [allPerks, setAllPerks] = useState(false)
  const perksId = useId()
  const oddsId = useId()
  useEffect(() => {
    const controller = new AbortController()
    shopGames(shop, controller.signal)
      .then((data) => setFacts({ shop, data }))
      .catch(() => undefined) // The shop page works without its games.
    return () => controller.abort()
  }, [shop])
  const data = facts?.shop === shop ? facts.data : null
  if (!data) return null
  const number = (n: number) => new Intl.NumberFormat(locale).format(n)
  const percent = new Intl.NumberFormat(locale, { style: 'percent' })
  const perks = [...data.perks].sort((a, b) => ORDER.indexOf(a.trigger) - ORDER.indexOf(b.trigger))
  return (
    <Box
      component="section"
      aria-label={t.perksHere}
      sx={{ mt: 3, p: 4, borderRadius: '16px', bgcolor: roles.surfaceContainerLow }}
    >
      {data.tried != null && (
        <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', mb: 2 }}>
          <Users size={20} aria-hidden="true" />
          <Typography variant="titleSmall" sx={{ fontWeight: 700 }}>
            {fill(t.tried, { n: number(data.tried) })}
          </Typography>
          {data.demo && <Chip size="small" label={p.demo} />}
        </Stack>
      )}
      {perks.length > 0 && (
        <>
          <Typography component="h2" variant="titleMedium" sx={{ fontWeight: 700 }}>
            {t.perksHere}
          </Typography>
          <Box id={perksId} component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}>
            {(allPerks ? perks : perks.slice(0, PERKS_SHOWN)).map((perk) => (
              <Stack
                component="li"
                key={perk.id}
                direction="row"
                sx={{
                  py: 1.5,
                  gap: 2,
                  alignItems: 'flex-start',
                  borderBottom: `1px solid ${roles.outlineVariant}`,
                }}
              >
                <Box sx={{ color: theme.chalk.lilac.main, pt: 0.25, display: 'grid' }}>
                  <Gift size={20} aria-hidden="true" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
                    {perk.text}
                  </Typography>
                  {!repeatsCondition(perk.text, t[`trigger_${perk.trigger}`]) && (
                    <Typography variant="bodySmall" color="text.secondary">
                      {t[`trigger_${perk.trigger}`]}
                    </Typography>
                  )}
                </Box>
              </Stack>
            ))}
          </Box>
          {perks.length > PERKS_SHOWN && (
            <Button
              size="small"
              onClick={() => setAllPerks((value) => !value)}
              aria-expanded={allPerks}
              aria-controls={perksId}
              sx={{ minHeight: 48, mt: 1 }}
            >
              {allPerks ? t.showFewerPerks : t.showMorePerks}
            </Button>
          )}
        </>
      )}
      <Stack direction="row" sx={{ mt: 2, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button
          size="small"
          onClick={() => setShowOdds((value) => !value)}
          aria-expanded={showOdds}
          aria-controls={oddsId}
          sx={{ minHeight: 48 }}
        >
          {t.odds}
        </Button>
        <HowItWorks game="scratch" />
      </Stack>
      <Collapse in={showOdds}>
        <Box id={oddsId} sx={{ pt: 1 }}>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: '1fr auto' }}>
            {data.odds.map((odd) => (
              <Box key={odd.prize} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="bodyMedium" sx={{ py: 0.5 }}>
                  {t[`odds_${odd.prize}`]}
                </Typography>
                <Typography
                  component="dd"
                  variant="labelLarge"
                  sx={{ m: 0, py: 0.5, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}
                >
                  {percent.format(odd.percent / 100)}
                </Typography>
              </Box>
            ))}
          </Box>
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
            {t.oddsFirst} {t.oddsNote}
          </Typography>
        </Box>
      </Collapse>
    </Box>
  )
}
