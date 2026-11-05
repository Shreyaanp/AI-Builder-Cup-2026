import { Box, Typography, useTheme } from '@mui/material'
import type { Product } from '../v1/api'
import { useWorkspace } from '../v1/workspaceContext'
import { productName } from '../../i18n/productNames'
import { useLocale } from '../../state/hooks'
import { StockStepper } from './StockStepper'
import { useStockCopy } from './stockCopy'

/**
 * An item's stock in plain sight (OB-310): "4 left", "Sold out", or nothing while it is not
 * counted, with − / + that save at once. Below what usually sells today it says so gently.
 */
export function StockLine({ product, usual }: { product: Product; usual?: number }) {
  const copy = useStockCopy()
  const ws = useWorkspace()
  const locale = useLocale()
  const roles = useTheme().material
  const name = productName(product.name, locale)
  const stock = product.stock ?? null
  // The owner's sold-out switch, what customers see; 0 left is a count, not that switch.
  const soldOut = product.available === false
  const low = !soldOut && stock !== null && usual !== undefined && stock < usual
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {(soldOut || stock !== null) && (
          <Typography
            variant="bodyLarge"
            data-stock={product.name}
            sx={{
              display: 'block',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              color: soldOut ? roles.onSurfaceVariant : roles.onSurface,
            }}
          >
            {soldOut ? copy.soldOut : copy.left(stock ?? 0)}
          </Typography>
        )}
        {low && (
          // Gentle, never alarming: the tertiary role, no red and no icon (OB-310).
          <Typography variant="bodyMedium" sx={{ display: 'block', color: roles.tertiary }}>
            {copy.low}
          </Typography>
        )}
      </Box>
      <StockStepper
        name={name}
        value={stock}
        onChange={(next) => void ws.setStock(product, { add: next - (stock ?? 0) })}
      />
    </Box>
  )
}
