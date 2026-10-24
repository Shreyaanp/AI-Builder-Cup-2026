import type { SxProps, Theme } from '@mui/material'

/**
 * One row of a settings sheet (profile): the whole width is the tap target, 48px tall, with the
 * icon and label starting on the sheet's own text edge. Every row in the sheet uses it, so the
 * sheet has a single alignment (A-21).
 */
export const settingsRowSx: SxProps<Theme> = {
  width: '100%',
  minHeight: 48,
  justifyContent: 'flex-start',
  textAlign: 'start',
  px: 0,
  color: 'text.primary',
  borderRadius: 3,
  '& .MuiButton-startIcon': { ml: 0, mr: 3, color: 'text.secondary' },
}
