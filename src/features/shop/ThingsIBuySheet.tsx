import { Box, Button, Typography } from '@mui/material'
import { ShoppingBasket } from 'lucide-react'
import { Sheet } from '../v1/Sheet'
import { useWorkspace } from '../v1/workspaceContext'
import { openBuyStock } from '../supply/supplyEvents'
import { useSupply } from '../supply/supplyData'
import { useOrderChangeCopy } from '../supply/orderChangeCopy'
import { ItemCard } from './MenuSheet'
import { onMenu } from './stock'
import { useStockCopy } from './stockCopy'
import { StockNote } from './StockNote'

/**
 * "Things I buy" (OB-310): tea dust, milk or flour the shop buys to make its menu, with their
 * stock and − / +. Customers never see these; the item editor's "Hide from menu" moves
 * one back to the menu. Buy stock orders them.
 */
export function ThingsIBuySheet({
  open,
  onClose,
  onBuyStock,
}: {
  open: boolean
  onClose: () => void
  /** Opened from Buy stock: back to it. */
  onBuyStock?: () => void
}) {
  const copy = useStockCopy()
  const ws = useWorkspace()
  const items = ws.products.filter((product) => !onMenu(product))
  const order = useOrderChangeCopy()
  const { data } = useSupply(open)
  const asks = new Set((data?.to_order ?? []).map((ask) => ask.item))
  return (
    <Sheet
      open={open}
      onClose={onClose}
      titleId="things-i-buy-title"
      title={copy.thingsIBuy}
      actions={
        <Button
          variant="contained"
          startIcon={<ShoppingBasket size={18} />}
          onClick={() => {
            onClose()
            if (onBuyStock) return onBuyStock()
            openBuyStock()
          }}
        >
          {copy.buyStock}
        </Button>
      }
    >
      {open && <StockNote inSheet />}
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mb: 4 }}>
        {items.length ? copy.thingsIBuyHint : copy.noThings}
      </Typography>
      <Box
        component="ul"
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
          gap: 2,
        }}
      >
        {items.map((product) => (
          <ItemCard
            key={product.id ?? `${product.name}-${product.unit}`}
            product={product}
            priced={false}
            orderMore={
              asks.has(product.name)
                ? {
                    label: order.orderMore,
                    run: () => {
                      onClose()
                      onBuyStock?.()
                      openBuyStock(product.name)
                    },
                  }
                : undefined
            }
            onEdit={() => {
              // Editors are their own dialogs; close the sheet first so modals never stack.
              onClose()
              ws.openEditor({ kind: 'product', product })
            }}
          />
        ))}
      </Box>
    </Sheet>
  )
}
