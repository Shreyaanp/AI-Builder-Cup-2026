import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { resolvePending, usePendingDiscard } from './backStack'
import { useCopy } from './strings'

/** Shown when Back would throw away a typed draft or an open review. */
export function DiscardPrompt() {
  const t = useCopy()
  const open = usePendingDiscard()
  return (
    <Dialog open={open} onClose={() => resolvePending(false)} aria-labelledby="discard-title">
      <DialogTitle id="discard-title">{t.discardTitle}</DialogTitle>
      <DialogContent>
        <Typography variant="bodyMedium" color="text.secondary">
          {t.discardBody}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 6 }}>
        <Button onClick={() => resolvePending(true)}>{t.discard}</Button>
        <Button variant="contained" autoFocus onClick={() => resolvePending(false)}>
          {t.keepEditing}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
