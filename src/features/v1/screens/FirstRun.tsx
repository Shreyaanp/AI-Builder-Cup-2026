import { Stack, Typography } from '@mui/material'
import { useWorkspace } from '../workspaceContext'
import { StartCard } from '../ShopCard'
import { TourOffer } from '../../tour/TourEntry'
import { useFirstRunCopy } from '../today/firstRunCopy'

/** Before a shop exists: one heading, one card, and the demo one tap away. Loads apart from Today. */
export function FirstRun() {
  const ws = useWorkspace()
  const first = useFirstRunCopy()
  return (
    <Stack spacing={{ xs: 3, sm: 5 }} sx={{ pt: { xs: 2, sm: 10 }, pb: 4 }}>
      <Typography component="h1" variant="headlineSmall">
        {first.firstTitle}
      </Typography>
      <StartCard />
      {/* First visit: see the product working on a filled demo shop. */}
      {ws.businesses.length === 0 && <TourOffer />}
      <Typography variant="bodyMedium" color="text.secondary">
        {first.justSay}
      </Typography>
    </Stack>
  )
}
