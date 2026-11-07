import { Box, type BoxProps } from '@mui/material'
import { layout } from './theme'

/** One app-bar baseline for both audiences and the front doors (OB-89).
 * Minimum height, rather than fixed height, lets enlarged text grow the row.
 * An inset separator leaves the baseline unchanged when the page scrolls.
 */
export function AppHeader({ sx, ...props }: BoxProps) {
  return (
    <Box
      component="header"
      {...props}
      data-app-header=""
      sx={[
        {
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexShrink: 0,
          minHeight: `calc(${layout.appBar}px + var(--app-header-safe-top, env(safe-area-inset-top, 0px)))`,
          pt: 'calc(8px + var(--app-header-safe-top, env(safe-area-inset-top, 0px)))',
          pb: 2,
          pl: 'max(16px, env(safe-area-inset-left, 0px))',
          pr: 'max(16px, env(safe-area-inset-right, 0px))',
          bgcolor: 'background.default',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  )
}
