import { Box, Chip, LinearProgress, Typography, useTheme } from '@mui/material'
import { CircleCheck } from 'lucide-react'
import { useFrontCopy } from './strings'
import { useCopy } from '../v1/strings'
import { useWorkspace } from '../v1/workspaceContext'

export function JourneyProgress({ step }: { step: number }) {
  const t = useFrontCopy()
  const label = t.step.replace('{step}', String(step)).replace('{total}', '5')
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="labelMedium">{label}</Typography>
      <LinearProgress aria-label={label} variant="determinate" value={step * 20} sx={{ mt: 2 }} />
    </Box>
  )
}

/**
 * Guidance follows actual server records, never a fabricated onboarding completion flag. Kept
 * small so the coach's first view fits a phone: one line and a bar while there is a next step,
 * and a single chip once setup is complete.
 */
export function OwnerJourney() {
  const ws = useWorkspace()
  const t = useFrontCopy()
  const owner = useCopy()
  const roles = useTheme().material
  if (ws.loading || ws.loadError || ws.businesses.length > 1) return null
  if (!ws.active)
    return (
      <Box sx={{ mt: 3 }}>
        <JourneyProgress step={3} />
        <Typography variant="bodyLarge">{t.introduce}</Typography>
      </Box>
    )
  if (ws.active.public)
    return (
      <Box sx={{ mt: 2 }}>
        <Chip
          icon={<CircleCheck size={18} />}
          label={owner.setupDone}
          variant="outlined"
          {...(ws.shareUrl
            ? {
                component: 'a',
                href: ws.shareUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
                clickable: true,
                'aria-label': `${owner.setupDone} · ${t.openPage}`,
              }
            : {})}
          sx={{
            height: 32,
            borderColor: roles.outlineVariant,
            '& .MuiChip-icon': { color: roles.primary },
          }}
        />
      </Box>
    )
  const label = t.step.replace('{step}', '4').replace('{total}', '5')
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="labelMedium">{label}</Typography>
      <LinearProgress aria-label={label} variant="determinate" value={80} sx={{ mt: 1 }} />
      <Typography variant="bodySmall" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {t.nextShare}
      </Typography>
    </Box>
  )
}
