import { Alert, Box, Button, LinearProgress, Typography } from '@mui/material'
import { useFrontCopy } from './strings'
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

/** Guidance follows actual server records, never a fabricated onboarding completion flag. */
export function OwnerJourney() {
  const ws = useWorkspace()
  const t = useFrontCopy()
  if (ws.loading || ws.loadError || ws.businesses.length > 1) return null
  if (!ws.active)
    return (
      <Box sx={{ mt: 3 }}>
        <JourneyProgress step={3} />
        <Typography variant="bodyLarge">{t.introduce}</Typography>
      </Box>
    )
  return (
    <Box sx={{ mt: 3 }}>
      <JourneyProgress step={ws.active.public ? 5 : 4} />
      <Alert
        severity="success"
        action={
          ws.active.public && ws.shareUrl ? (
            <Button href={ws.shareUrl} target="_blank" rel="noopener noreferrer">
              {t.openPage}
            </Button>
          ) : undefined
        }
      >
        {ws.active.public ? t.celebration : t.nextShare}
      </Alert>
    </Box>
  )
}
