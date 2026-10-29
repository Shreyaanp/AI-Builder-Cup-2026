import { useState, type ReactNode } from 'react'
import { Box, Button, CircularProgress, Typography, useTheme } from '@mui/material'
import { Sparkles } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { useWorkspace } from '../v1/workspaceContext'
import { tourCopy } from './strings'
import { startDemoTour } from './tourActions'

// The tour's entry points live apart from the walkthrough itself (Tour.tsx), so the owner's first
// screen can offer the tour without loading it (OB-165).

/** Offer card for owners with no shop yet: creates the filled demo shop and starts the tour. */
export function TourOffer() {
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  const roles = useTheme().material
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <Box
      sx={{
        p: 4,
        borderRadius: '24px',
        bgcolor: roles.secondaryContainer,
        color: roles.onSecondaryContainer,
      }}
    >
      <Typography variant="titleMedium">{t.offerTitle}</Typography>
      <Typography variant="bodyMedium" sx={{ mt: 1 }}>
        {t.offerBody}
      </Typography>
      <Button
        variant="contained"
        sx={{ mt: 3 }}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} /> : <Sparkles size={18} />}
        onClick={() => void startDemoTour(ws, setBusy, setFailed)}
      >
        {busy ? t.preparing : t.offerButton}
      </Button>
      {failed && (
        <Typography variant="bodySmall" color="error" sx={{ mt: 1 }} role="alert">
          {t.failed}
        </Typography>
      )}
    </Box>
  )
}

/** Settings entry: replay the tour on the demo shop at any time. The settings list draws it as one
 * of its own rows, so it shares their edge (OB-71). */
export function TourMenuButton({
  onStart,
  children,
}: {
  onStart: () => void
  children: (start: () => void, label: string) => ReactNode
}) {
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  return children(() => {
    onStart()
    void startDemoTour(ws)
  }, t.settings)
}
