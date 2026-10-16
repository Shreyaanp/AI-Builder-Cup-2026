import { useState } from 'react'
import { Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material'
import { Gift } from 'lucide-react'
import { dealIn } from '../../../design/chalkMotion'
import { fill, usePassportCopy } from '../copy'
import { useGameActions } from './api'
import type { WonPerk } from './api'
import { useGamesCopy } from './copy'

/** Prizes won on scratch cards and collection sets, shown at the counter and marked used. */
export function WonPerks({ perks, signedIn }: { perks: WonPerk[]; signedIn: boolean }) {
  const t = useGamesCopy()
  const p = usePassportCopy()
  const theme = useTheme()
  const lilac = theme.chalk.lilac
  const { markPerkUsed } = useGameActions()
  const [busy, setBusy] = useState('')
  if (!perks.length) return null
  return (
    <Box component="section" aria-label={t.wonPerks}>
      <Typography component="h3" variant="titleMedium" sx={{ fontWeight: 700, mb: 1.5 }}>
        {t.wonPerks}
      </Typography>
      <Stack spacing={2}>
        {perks.map((perk) => (
          <Stack
            key={perk.id}
            direction="row"
            sx={{
              p: 3,
              gap: 3,
              alignItems: 'center',
              flexWrap: 'wrap',
              borderRadius: '20px',
              bgcolor: perk.used ? theme.material.surfaceContainerLow : lilac.container,
              color: perk.used ? theme.material.onSurfaceVariant : lilac.onContainer,
              ...dealIn,
            }}
          >
            <Gift size={28} aria-hidden="true" />
            <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
              <Typography variant="titleMedium" sx={{ fontWeight: 700 }}>
                {perk.text}
              </Typography>
              <Typography variant="bodySmall">
                {fill(t.wonFrom, { shop: (perk.shop_name ?? '').replace(/\s*\(Demo\)$/, '') })}
              </Typography>
            </Box>
            {perk.demo && <Chip size="small" label={p.demoPerk} />}
            {perk.used ? (
              <Typography variant="labelLarge">{t.used}</Typography>
            ) : (
              signedIn && (
                <Button
                  variant="outlined"
                  color="inherit"
                  disabled={busy === perk.id}
                  onClick={() => {
                    setBusy(perk.id)
                    markPerkUsed(perk.id)
                      .catch(() => undefined)
                      .finally(() => setBusy(''))
                  }}
                >
                  {t.usePerk}
                </Button>
              )
            )}
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}
