import type { ReactNode } from 'react'
import { Box, ButtonBase, Typography, useTheme } from '@mui/material'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { shape } from '../../design/theme'

/** Rows in one rounded group, a hairline between them (the Shop list, like You). */
export function RowGroup({ children }: { children: ReactNode }) {
  const roles = useTheme().material
  return (
    <Box
      sx={{
        bgcolor: roles.surfaceContainer,
        borderRadius: `${shape.lg}px`,
        overflow: 'hidden',
        '& > * + *': { borderTop: `1px solid ${roles.outlineVariant}` },
      }}
    >
      {children}
    </Box>
  )
}

/**
 * One tappable row: icon, name, one short status and ›. `expanded` makes it a disclosure (its
 * rows show below it on the same screen) instead of opening a sheet.
 */
export function ShopRow({
  icon,
  label,
  value,
  onClick,
  tour,
  expanded,
  controls,
}: {
  icon: ReactNode
  label: string
  value?: ReactNode
  onClick: () => void
  /** Guided-tour anchor (data-tour). */
  tour?: string
  expanded?: boolean
  controls?: string
}) {
  const roles = useTheme().material
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <ButtonBase
      onClick={onClick}
      data-tour={tour}
      aria-expanded={expanded}
      aria-controls={controls}
      sx={{
        width: '100%',
        minHeight: 56,
        px: 4,
        py: 2,
        gap: 3,
        justifyContent: 'flex-start',
        textAlign: 'start',
        color: roles.onSurface,
        '&:hover': { bgcolor: roles.surfaceContainerHigh },
        '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: -3 },
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
        {icon}
      </Box>
      <Typography
        component="span"
        variant="bodyLarge"
        sx={{ flex: '0 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}
      >
        {label}
      </Typography>
      <Typography
        component="span"
        variant="bodyMedium"
        color="text.secondary"
        sx={{
          flex: '1 1 30%',
          minWidth: 0,
          textAlign: 'end',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      <Chevron size={18} aria-hidden="true" color={roles.onSurfaceVariant} />
    </ButtonBase>
  )
}
