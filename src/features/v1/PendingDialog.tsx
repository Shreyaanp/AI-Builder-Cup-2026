import { Dialog, DialogContent, DialogTitle, Skeleton, Stack } from '@mui/material'
import { useBackClose } from './backStack'

// Reduced motion: the placeholders hold still.
const still = {
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
    '&::after': { animation: 'none' },
  },
}

/**
 * Stands in for a deferred dialog while its code arrives (OB-165): the tap answers at once, and
 * Back or Escape closes it, so the dialog never pops up after the owner has moved on.
 */
export function PendingDialog({
  title,
  fullScreen,
  onClose,
}: {
  title: string
  fullScreen: boolean
  onClose: () => void
}) {
  useBackClose(true, onClose)
  return (
    <Dialog
      open
      fullScreen={fullScreen}
      onClose={onClose}
      aria-labelledby="pending-dialog-title"
      aria-busy="true"
      data-testid="pending-dialog"
    >
      <DialogTitle id="pending-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ minWidth: { sm: 360 } }}>
          {[56, 56, 56].map((height, index) => (
            <Skeleton key={index} variant="rounded" animation="wave" height={height} sx={still} />
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
