import { Box, Typography, useTheme } from '@mui/material'
import { shape } from '../../design/theme'

/** A document's raw text (EDI, IDoc, CSV) in a scrollable, focusable block. */
export function Code({ label, text }: { label: string; text: string }) {
  const roles = useTheme().material
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="labelMedium" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {label}
      </Typography>
      <Box
        component="pre"
        tabIndex={0}
        aria-label={label}
        sx={{
          m: 0,
          p: 2,
          maxHeight: 260,
          overflow: 'auto',
          borderRadius: `${shape.sm}px`,
          bgcolor: roles.surfaceContainerHighest,
          color: roles.onSurface,
          fontFamily: '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: 'pre',
          '&:focus-visible': { outline: `2px solid ${roles.primary}`, outlineOffset: 2 },
        }}
      >
        {text}
      </Box>
    </Box>
  )
}
