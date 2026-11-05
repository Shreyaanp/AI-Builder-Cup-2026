import type { ReactNode } from 'react'
import { Box, IconButton, useTheme } from '@mui/material'
import { Minus, Plus } from 'lucide-react'
import { useStockCopy } from './stockCopy'

/**
 * − / + for a stock count (OB-310). 48 px targets, around the count input in the item editor or
 * beside the "4 left" line on a menu item. − stops at 0; + from "not counted" starts at 1.
 */
export function StockStepper({
  name,
  label,
  value,
  onChange,
  disabled = false,
  children,
}: {
  name: string
  /** The group's name; "Stock of Bun maska" unless given. */
  label?: string
  value: number | null
  onChange: (next: number) => void
  disabled?: boolean
  /** The count between the buttons; without it the two buttons sit side by side. */
  children?: ReactNode
}) {
  const copy = useStockCopy()
  const roles = useTheme().material
  const button = {
    width: 48,
    height: 48,
    flexShrink: 0,
    color: roles.onSurface,
    border: `1px solid ${roles.outlineVariant}`,
    '&:focus-visible': { outline: `2px solid ${roles.primary}` },
  }
  return (
    <Box
      role="group"
      aria-label={label ?? copy.stockOf(name)}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}
    >
      <IconButton
        aria-label={copy.less(name)}
        disabled={disabled || !value}
        onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
        sx={button}
      >
        <Minus size={18} />
      </IconButton>
      {children && <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>{children}</Box>}
      <IconButton
        aria-label={copy.more(name)}
        disabled={disabled}
        onClick={() => onChange((value ?? 0) + 1)}
        sx={button}
      >
        <Plus size={18} />
      </IconButton>
    </Box>
  )
}
