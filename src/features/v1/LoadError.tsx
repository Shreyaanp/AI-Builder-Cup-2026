import { Alert, Button } from '@mui/material'
import { useState } from 'react'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'

/** Shown instead of empty states when shops could not be loaded. */
export function LoadError() {
  const t = useCopy()
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  if (!ws.loadError) return null
  return (
    <Alert
      severity="error"
      role="alert"
      action={
        <Button
          color="inherit"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void ws.retryLoad().finally(() => setBusy(false))
          }}
        >
          {t.retryLoad}
        </Button>
      }
    >
      {t.loadFailed}
    </Alert>
  )
}
