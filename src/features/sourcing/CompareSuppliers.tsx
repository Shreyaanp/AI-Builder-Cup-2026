import { Box, useTheme } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { useOrderUnit } from '../supply/supplyData'
import { formatShopPrice, toMinor } from '../v1/format'
import { useSourcingCopy } from './copy'
import { useSupplierCopy } from './supplierCopy'
import type { SupplierCard, SupplierResult } from './types'

/** Suppliers side by side in one unit, cheapest first. A price that can't be compared is last. */
export function CompareSuppliers({ result }: { result: SupplierResult }) {
  const roles = useTheme().material
  const s = useSupplierCopy()
  const sourcing = useSourcingCopy()
  const locale = useLocale()
  const unit = useOrderUnit()
  const km = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const money = (major: number) =>
    formatShopPrice(toMinor(major, result.currency), result.currency, locale)
  const price = (card: SupplierCard) => card.compare?.price ?? Number.POSITIVE_INFINITY
  const rows = [...result.suppliers].sort((a, b) => price(a) - price(b))
  const cell = { p: 2, textAlign: 'start', verticalAlign: 'top', overflowWrap: 'anywhere' } as const
  return (
    <Box
      component="table"
      data-testid="compare-suppliers"
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        typography: 'bodyMedium',
        fontVariantNumeric: 'tabular-nums',
        '& tr': { borderTop: `1px solid ${roles.outlineVariant}` },
      }}
    >
      <thead>
        <tr>
          <Box component="th" scope="col" sx={{ ...cell, pl: 4 }}>
            {s.supplier}
          </Box>
          <Box component="th" scope="col" sx={cell}>
            {s.price}
          </Box>
          <Box component="th" scope="col" sx={{ ...cell, pr: 4, whiteSpace: 'nowrap' }}>
            {s.distance}
          </Box>
        </tr>
      </thead>
      <tbody>
        {rows.map((card) => (
          <tr key={card.id}>
            <Box component="th" scope="row" sx={{ ...cell, pl: 4, fontWeight: 500 }}>
              {card.name}
            </Box>
            <Box component="td" sx={cell}>
              {card.compare
                ? sourcing.perUnit(money(card.compare.price), unit(card.compare.unit))
                : `${sourcing.perUnit(money(card.item.price), unit(card.item.unit))} · ${s.noSize}`}
            </Box>
            <Box component="td" sx={{ ...cell, pr: 4, whiteSpace: 'nowrap' }}>
              {sourcing.km(km.format(card.distance_km))}
            </Box>
          </tr>
        ))}
      </tbody>
    </Box>
  )
}
