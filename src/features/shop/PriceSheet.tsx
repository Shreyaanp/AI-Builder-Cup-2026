import { useState } from 'react'
import { Box, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { Search } from 'lucide-react'
import { productName } from '../../i18n/productNames'
import { useLocale } from '../../state/hooks'
import { Sheet } from '../v1/Sheet'
import { useCopy } from '../v1/strings'
import { useWorkspace } from '../v1/workspaceContext'
import { useAddManyCopy } from './addManyCopy'
import { PriceField } from './MenuSheet'
import { onMenu } from './stock'
import { unitLabel } from './units'
import { useShopCopy } from './strings'

/** Past this many items a list is quicker to search than to scroll. */
const SEARCH_FROM = 8

/**
 * "Change a price" from the coach's chips: every item with its price, tap one and change it in
 * place. Works without the AI, like "Something sold out?" beside it; the owner still confirms the
 * exact new price before it saves.
 */
export function PriceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useCopy()
  const copy = useAddManyCopy()
  const shopCopy = useShopCopy()
  const locale = useLocale()
  const ws = useWorkspace()
  const [query, setQuery] = useState('')
  const menu = ws.products.filter(onMenu)
  const wanted = query.trim().toLowerCase()
  const shown = menu.filter(
    (product) =>
      !wanted ||
      product.name.toLowerCase().includes(wanted) ||
      productName(product.name, locale).toLowerCase().includes(wanted),
  )
  return (
    <Sheet open={open} onClose={onClose} titleId="price-sheet-title" title={t.chipPrice}>
      <Stack spacing={3}>
        <Typography variant="bodyMedium" color="text.secondary">
          {menu.length ? copy.priceHint : t.productsEmpty}
        </Typography>
        {menu.length > SEARCH_FROM && (
          <TextField
            label={copy.findItem}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} aria-hidden="true" />
                  </InputAdornment>
                ),
              },
              htmlInput: { autoComplete: 'off', enterKeyHint: 'search' },
            }}
          />
        )}
        {wanted && shown.length === 0 && (
          <Typography role="status" variant="bodyMedium">
            {copy.noMatch}
          </Typography>
        )}
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {shown.map((product) => (
            <Box
              component="li"
              key={product.id ?? `${product.name}-${product.unit}`}
              data-price-item={product.name}
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                minHeight: 56,
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Box sx={{ flex: '1 1 120px', minWidth: 0 }}>
                <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
                  {productName(product.name, locale)}
                </Typography>
                <Typography variant="bodyMedium" color="text.secondary">
                  {unitLabel(product.unit, shopCopy)}
                </Typography>
              </Box>
              <PriceField product={product} />
            </Box>
          ))}
        </Box>
      </Stack>
    </Sheet>
  )
}
