import type { ReactNode } from 'react'
import { Box, useTheme } from '@mui/material'
import { usePaceCopy } from './paceCopy'

/** Native disclosure keeps forms mounted and preserves their values when folded. */
export function Disclosure({
  title,
  open,
  children,
}: {
  title?: string
  /** Keeps the section unfolded while it reports something the owner must see. */
  open?: boolean
  children: ReactNode
}) {
  const roles = useTheme().material
  const c = usePaceCopy()
  return (
    <Box component="details" open={open} sx={{ minWidth: 0 }}>
      <Box
        component="summary"
        sx={{
          cursor: 'pointer',
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          color: roles.primary,
          typography: 'bodyLarge',
          '&::before': { content: '"+"' },
          'details[open] > &::before': { content: '"−"' },
          '&:focus-visible': { outline: `2px solid ${roles.primary}`, outlineOffset: 2 },
        }}
      >
        {title ?? c.more}
      </Box>
      <Box sx={{ pt: 2 }}>{children}</Box>
    </Box>
  )
}
