import { useState, type ReactNode } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { ChevronRight } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { useWorkspace } from '../v1/workspaceContext'
import { tourCopy } from './strings'
import { startDemoTour } from './tourActions'
import { useFirstRunCopy } from '../v1/today/firstRunCopy'

// The tour's entry points live apart from the walkthrough itself (Tour.tsx), so the owner's first
// screen can offer the tour without loading it (OB-165).

/** First run, no shop yet: a quiet link under the start card that opens the filled demo shop and
 * starts the tour (SIMPLIFY §3.3: one card, the demo one tap away). */
export function TourOffer() {
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  const s = useFirstRunCopy()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <Box>
      <Button
        disabled={busy}
        endIcon={
          busy ? <CircularProgress size={16} /> : <ChevronRight size={18} aria-hidden="true" />
        }
        onClick={() => void startDemoTour(ws, setBusy, setFailed)}
        sx={{ minHeight: 48, px: 1 }}
      >
        {busy ? t.preparing : s.seeDemo}
      </Button>
      {failed && (
        <Typography variant="bodyMedium" color="error" sx={{ mt: 1 }} role="alert">
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
