import { useState } from 'react'
import { Button, Skeleton, Stack, Typography } from '@mui/material'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { productName } from '../../i18n/productNames'
import { useOrderUnit } from '../supply/supplyData'
import { formatShopPrice, toMinor } from '../v1/format'
import { useSourcingCopy } from './copy'
import { useSupplierCopy } from './supplierCopy'
import { useSaved, useSaveSupplier, useSupplierDetail } from './supplierData'

/** One supplier opened: how far, what it sells at what price, and Save. */
export function SupplierDetails({ id, name }: { id: string; name: string }) {
  const s = useSupplierCopy()
  const sourcing = useSourcingCopy()
  const locale = useLocale()
  const unit = useOrderUnit()
  const state = useSupplierDetail(id)
  const save = useSaveSupplier()
  const [busy, setBusy] = useState(false)
  const detail = state?.detail ?? null
  const saved = useSaved(id, detail?.saved ?? false)
  if (state?.failed)
    return (
      <Typography role="alert" variant="bodyLarge">
        {s.failed}
      </Typography>
    )
  if (!detail)
    return (
      <Stack spacing={2} aria-busy="true">
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={120} />
      </Stack>
    )
  const km = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const money = (major: number) =>
    formatShopPrice(toMinor(major, detail.currency), detail.currency, locale)
  const facts = [
    detail.distance_km == null ? '' : s.away(km.format(detail.distance_km)),
    detail.delivery ? `${s.delivery}: ${detail.delivery}` : '',
    detail.min_order ? `${s.minOrder}: ${detail.min_order}` : '',
  ].filter(Boolean)
  return (
    <Stack spacing={3}>
      {facts.map((fact) => (
        <Typography key={fact} variant="bodyMedium" color="text.secondary">
          {fact}
        </Typography>
      ))}
      <Button
        variant="outlined"
        disabled={busy}
        aria-pressed={saved}
        startIcon={saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
        sx={{ alignSelf: 'flex-start', minHeight: 48 }}
        onClick={async () => {
          setBusy(true)
          await save({ id, name }, !saved)
          setBusy(false)
        }}
      >
        {saved ? s.remove : s.save}
      </Button>
      <Typography variant="titleSmall">{s.sells}</Typography>
      <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {detail.products.map((product) => (
          <Stack
            component="li"
            key={`${product.name}-${product.unit}`}
            direction="row"
            sx={{ gap: 2, justifyContent: 'space-between', alignItems: 'baseline' }}
          >
            <Typography
              variant="bodyLarge"
              color={product.available ? 'text.primary' : 'text.secondary'}
              sx={{ minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {productName(product.name, locale)}
            </Typography>
            <Typography
              variant="bodyLarge"
              sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
            >
              {product.available
                ? sourcing.perUnit(money(product.price), unit(product.unit))
                : sourcing.outOfStock}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}
