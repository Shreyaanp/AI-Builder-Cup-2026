import type { ReactNode } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import { shape } from '../../design/theme'
import { categoryLabel, useShopCopy } from './strings'

import { groupProducts, type Categorised } from './groupProducts'

export function CategoryGroups<T extends Categorised>({
  products,
  children,
  inline = false,
  columns = false,
}: {
  products: T[]
  children: (items: T[]) => ReactNode
  inline?: boolean
  /** Lay the groups side by side when there is room (200px+ each). */
  columns?: boolean
}) {
  const t = useShopCopy()
  const roles = useTheme().material
  return (
    <Box
      component={inline ? 'span' : 'div'}
      sx={{
        display: 'grid',
        gap: 2,
        minWidth: 0,
        alignItems: 'start',
        gridTemplateColumns: columns
          ? 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))'
          : undefined,
      }}
    >
      {groupProducts(products).map((group) => (
        <Box
          component={inline ? 'span' : 'section'}
          key={group.category}
          aria-label={inline ? undefined : categoryLabel(group.category, t)}
          sx={{
            display: 'block',
            minWidth: 0,
            bgcolor: roles.surfaceContainerLow,
            border: `1px solid ${roles.outlineVariant}`,
            borderRadius: `${shape.md}px`,
            overflow: 'hidden',
          }}
        >
          <Typography
            component={inline ? 'span' : 'h3'}
            variant="labelLarge"
            sx={{
              display: 'block',
              px: 2,
              py: 1,
              color: roles.onSurfaceVariant,
              overflowWrap: 'anywhere',
            }}
          >
            {categoryLabel(group.category, t)}
          </Typography>
          {children(group.items)}
        </Box>
      ))}
    </Box>
  )
}
