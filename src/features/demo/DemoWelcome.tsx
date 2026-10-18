import { useRef, useState } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import { Sparkles } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { Sheet } from '../v1/Sheet'
import { useWorkspace } from '../v1/workspaceContext'
import { tourCopy } from '../tour/strings'
import { startDemoTour } from '../tour/tourActions'

const SEEN = 'chalkboard.demo.welcome.v1'

/** Offered once per browser tab: a reload (or a second visit) never puts it over the tabs again. */
function seen() {
  try {
    return sessionStorage.getItem(SEEN) === '1'
  } catch {
    return false
  }
}

function remember() {
  try {
    sessionStorage.setItem(SEEN, '1')
  } catch {
    // Private mode: the sheet may show again after a reload, which is harmless.
  }
}

/** The demo's first screen offers the guided tour once; Help keeps it reachable later. */
export function DemoWelcome() {
  const ws = useWorkspace()
  const t = tourCopy(useLocale())
  const [open, setOpen] = useState(() => !seen())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const startAfterClose = useRef(false)
  const close = () => {
    remember()
    setOpen(false)
  }
  return (
    <Sheet
      open={open}
      onClose={close}
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
            disabled={busy || !ws.active}
            startIcon={
              busy ? <CircularProgress size={16} color="inherit" /> : <Sparkles size={18} />
            }
            onClick={() => {
              // Let this sheet's focus trap finish exiting before the tour opens its own.
              startAfterClose.current = true
              close()
            }}
            sx={{ minHeight: 48 }}
          >
            {busy ? t.preparing : t.offerButton}
          </Button>
          <Button onClick={close} sx={{ minHeight: 48 }}>
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
