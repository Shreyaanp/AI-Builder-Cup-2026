import { useEffect, useRef, useState } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import { Sparkles } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { Sheet } from '../v1/Sheet'
import { useWorkspace } from '../v1/workspaceContext'
import { tourCopy } from '../tour/strings'
import { startDemoTour } from '../tour/tourActions'

/** The demo's first screen offers the guided tour once; Help keeps it reachable later. */
export function DemoWelcome() {
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  // Arriving from 'Take the tour' in the owner app (/demo?tour=1) starts the tour without asking again.
  const [tourAsked] = useState(
    () => new URLSearchParams(window.location.search).get('tour') === '1',
  )
  const asked = useRef(tourAsked)
  // The offer never opens then: a sheet closing as the tour opens left the app (and the tour
  // card inside it) aria-hidden, so screen readers lost the whole tour.
  const [open, setOpen] = useState(!tourAsked)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const startAfterClose = useRef(false)
  useEffect(() => {
    if (!asked.current || !ws.active) return
    asked.current = false
    history.replaceState(history.state, '', window.location.pathname)
    void startDemoTour(ws, setBusy, setFailed).then((started) => {
      if (!started) setOpen(true)
    })
  }, [ws])
  if (!ws.active) return null
  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      onExited={() => {
        if (!startAfterClose.current) return
        startAfterClose.current = false
        void startDemoTour(ws, setBusy, setFailed).then((started) => {
          if (!started) setOpen(true)
        })
      }}
      titleId="demo-welcome-title"
      title={t.offerTitle}
      dismissInActions
      actions={
        <Stack spacing={1} sx={{ width: '100%' }}>
          <Button
            variant="contained"
            disabled={busy}
            startIcon={
              busy ? <CircularProgress size={16} color="inherit" /> : <Sparkles size={18} />
            }
            onClick={() => {
              // Let this sheet's focus trap finish exiting before the tour opens its own.
              startAfterClose.current = true
              setOpen(false)
            }}
            sx={{ minHeight: 48 }}
          >
            {busy ? t.preparing : t.offerButton}
          </Button>
          <Button onClick={() => setOpen(false)} sx={{ minHeight: 48 }}>
            {t.skip}
          </Button>
        </Stack>
      }
    >
      <Typography variant="bodyLarge">{t.offerBody}</Typography>
      {failed && (
        <Typography role="alert" color="error" sx={{ mt: 2 }}>
          {t.failed}
        </Typography>
      )}
    </Sheet>
  )
}
