import { useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Typography, useTheme } from '@mui/material'
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

/** Settings entry: replay the tour on the demo shop at any time. */
export function TourMenuButton({ onStart }: { onStart: () => void }) {
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  return (
    <ButtonBase
      onClick={() => {
        onStart()
        void startDemoTour(ws)
      }}
      sx={{ minHeight: 48, width: '100%', px: 2, gap: 2, justifyContent: 'flex-start' }}
    >
      <Sparkles size={18} aria-hidden="true" />
      <Typography variant="bodyLarge">{t.settings}</Typography>
    </ButtonBase>
  )
}
