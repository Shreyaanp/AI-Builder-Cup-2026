import type { ReactNode } from 'react'
import {
  Box,
  Button,
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
import { useBackClose } from './backStack'
import { useCopy } from './strings'

const timing = { enter: motion.duration.enter, exit: motion.duration.exit }

/**
 * M3 modal bottom sheet on compact windows (drag handle, scrim, swipe down / Esc / scrim to
 * close, focus trapped by the modal); a dialog on wider windows. Used by every coach sheet so
 * they share one shape and motion. The phone's Back button closes it first; with `dirty`, Back
 * asks "Discard changes?" instead.
 */
export function Sheet({
  open,
  onClose,
  titleId,
  title,
  children,
  actions,
  onEntered,
  onExited,
  keepMounted = false,
  dirty = false,
  dismissInActions = false,
  ownsHistory = true,
}: {
  open: boolean
  onClose: () => void
  titleId: string
  /** Omit when the content brings its own heading with id `titleId`. */
  title?: ReactNode
  children: ReactNode
  actions?: ReactNode
  onEntered?: () => void
  onExited?: () => void
  /** Keep content (and typed drafts) mounted while closed. */
  keepMounted?: boolean
  /** Unsaved input inside: Back asks before closing. */
  dirty?: boolean
  /** `actions` already hold a Cancel/Back/Done, so the phone sheet adds no Close of its own. */
  dismissInActions?: boolean
  /** False when the sheet's own address is its history entry (the map's `?view=map`). */
  ownsHistory?: boolean
}) {
  const roles = useTheme().material
  const t = useCopy()
  const compact = useMediaQuery(`(max-width:${windowClass.medium - 1}px)`)
  useBackClose(open && ownsHistory, onClose, dirty)
  // Swipe, Esc and the scrim also close; the button makes it obvious and works for everyone.
  // Desktop keeps the corner X; a phone gets Close in the bottom row, inside the thumb zone.
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
        ModalProps={{ keepMounted }}
        slotProps={{
          // A sheet mounted already open still slides in (and calls onEntered): the Drawer
          // otherwise skips that first transition.
          transition: { onEntered, onExited, appear: true },
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
              // The paper stays position: fixed at the bottom edge (MUI's own rule). It is
              // already the containing block for the close button; overriding it to
              // relative put the sheet in normal flow at the top of the screen (B1).
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
        {title && (
          <Typography
            id={titleId}
            component="h2"
            variant="headlineSmall"
            sx={{ px: 6, pt: 2, pb: 4 }}
          >
            {title}
          </Typography>
        )}
        {/* Only the content scrolls; the title and actions stay put inside the 90dvh cap. */}
        <Box
          sx={{
            flex: '1 1 auto',
            minHeight: 0,
            px: 6,
            pb: 4,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          {children}
        </Box>
        {(actions || !dismissInActions) && (
          <Stack
            direction="row"
            sx={{
              justifyContent: 'flex-end',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
              px: 6,
              pb: 6,
              pt: 2,
              flexShrink: 0,
            }}
          >
            {/* Beside other actions Close is a 48px X, so they stay one row (e.g. the menu's
                Import and Add product); alone it is spelled out. */}
            {!dismissInActions &&
              (actions ? (
                <IconButton
                  aria-label={t.close}
                  onClick={onClose}
                  sx={{ width: 48, height: 48, mr: 'auto' }}
                >
                  <X size={20} />
                </IconButton>
              ) : (
                <Button onClick={onClose} sx={{ minHeight: 48, mr: 'auto' }}>
                  {t.close}
                </Button>
              ))}
            {actions}
          </Stack>
        )}
      </SwipeableDrawer>
    )
  return (
    <Dialog
      open={open}
      keepMounted={keepMounted}
      onClose={onClose}
      aria-labelledby={titleId}
      transitionDuration={timing}
      slotProps={{ transition: { onEntered, onExited } }}
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
