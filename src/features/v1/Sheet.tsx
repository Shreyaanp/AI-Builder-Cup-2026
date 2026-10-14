import type { ReactNode } from 'react'
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  SwipeableDrawer,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { X } from 'lucide-react'
import { motion, shape, windowClass } from '../../design/theme'
import { useCopy } from './strings'

const timing = { enter: motion.duration.enter, exit: motion.duration.exit }

/**
 * M3 modal bottom sheet on compact windows (drag handle, scrim, swipe down / Esc / scrim to
 * close, focus trapped by the modal); a dialog on wider windows. Used by every coach sheet so
 * they share one shape and motion.
 */
export function Sheet({
  open,
  onClose,
  titleId,
  title,
  children,
  actions,
  onEntered,
}: {
  open: boolean
  onClose: () => void
  titleId: string
  /** Omit when the content brings its own heading with id `titleId`. */
  title?: ReactNode
  children: ReactNode
  actions?: ReactNode
  onEntered?: () => void
}) {
  const roles = useTheme().material
  const t = useCopy()
  const compact = useMediaQuery(`(max-width:${windowClass.medium - 1}px)`)
  // Swipe, Esc and the scrim also close; the button makes it obvious and works for everyone.
  const close = (
    <IconButton
      aria-label={t.close}
      onClick={onClose}
      sx={{ position: 'absolute', top: 8, right: 8, width: 48, height: 48, zIndex: 1 }}
    >
      <X size={20} />
    </IconButton>
  )

  if (compact)
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        onOpen={() => undefined}
        disableSwipeToOpen
        disableDiscovery
        transitionDuration={timing}
        // Unmount when closed, like a dialog: no hidden copy left in the page.
        ModalProps={{ keepMounted: false }}
        slotProps={{
          transition: { onEntered },
          paper: {
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': titleId,
            sx: {
              borderTopLeftRadius: `${shape.xl}px`,
              borderTopRightRadius: `${shape.xl}px`,
              bgcolor: roles.surfaceContainerLow,
              maxHeight: '90dvh',
              pb: 'env(safe-area-inset-bottom)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            },
          },
        }}
      >
        <Box
          aria-hidden="true"
          sx={{
            width: 32,
            height: 4,
            flexShrink: 0,
            borderRadius: 2,
            bgcolor: roles.onSurfaceVariant,
            opacity: 0.4,
            mx: 'auto',
            mt: 4,
            mb: 2,
          }}
        />
        {close}
        {title && (
          <Typography
            id={titleId}
            component="h2"
            variant="headlineSmall"
            sx={{ px: 6, pr: 16, pt: 2, pb: 4 }}
          >
            {title}
          </Typography>
        )}
        <Box sx={{ px: 6, pb: 4, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {children}
        </Box>
        {actions && (
          <Stack
            direction="row"
            sx={{ justifyContent: 'flex-end', gap: 2, px: 6, pb: 6, pt: 2, flexShrink: 0 }}
          >
            {actions}
          </Stack>
        )}
      </SwipeableDrawer>
    )
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      transitionDuration={timing}
      slotProps={{ transition: { onEntered } }}
    >
      {close}
      {title && (
        <DialogTitle id={titleId} sx={{ pr: 16 }}>
          {title}
        </DialogTitle>
      )}
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions sx={{ px: 6, pb: 6 }}>{actions}</DialogActions>}
    </Dialog>
  )
}
