import { Suspense, useState } from 'react'
import { Box, Button, CircularProgress, Stack, Typography, useTheme } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { shape } from '../../design/theme'
import { useWorkspace } from '../v1/workspaceContext'
import { Sheet } from '../v1/Sheet'
import { PurchaseOrderCard } from './supplyDeferred'
import { useShowcaseCopy } from './showcaseCopy'
import { useSupplyCopy } from './copy'
import { useOrderChangeCopy } from './orderChangeCopy'
import { dayLabel, useDraftReorder, useSupply } from './supplyData'
import type { PurchaseOrder } from './types'
import { productName } from '../../i18n/productNames'

export function TodaySupply() {
  const { products, active, notify } = useWorkspace()
  const { data, refresh } = useSupply(true)
  const draft = useDraftReorder()
  const s = useShowcaseCopy()
  const copy = useSupplyCopy()
  const c = useOrderChangeCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [busy, setBusy] = useState(false)
  const need = data?.needs?.[0]
  const received = data?.orders.find(
    (po) =>
      po.received &&
      po.received_stock &&
      Object.keys(po.received_stock).length > 0 &&
      Object.entries(po.received_stock).every(([name, stock]) =>
        products.some((p) => p.name === name && p.stock != null && p.stock >= stock),
      ),
  )
  const item = need?.item ?? received?.lines[0]?.item
  if (!active || !item) return null
  const close = () => {
    setOrder(null)
    void refresh()
  }
  return (
    <>
      <Stack
        component="section"
        aria-label={s.title}
        data-tour="today-supply"
        spacing={2}
        sx={{
          p: 4,
          borderRadius: `${shape.lg}px`,
          bgcolor: roles.primaryContainer,
          color: roles.onPrimaryContainer,
        }}
      >
        <Typography variant="titleSmall" component="h2">
          {s.title}
        </Typography>
        <Typography variant="titleLarge" component="p" aria-live="polite">
          {productName(item, locale)}{' '}
          {need ? `${s.runsOut} ${dayLabel(need.runs_out, locale)}` : s.restocked}
        </Typography>
        {need?.on_order ? (
          <Typography variant="bodyLarge">
            {c.onOrderLine(
              new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(need.on_order),
              products.find((p) => p.name === need.item)?.unit ?? '',
              dayLabel(need.arrives ?? '', locale),
            )}
          </Typography>
        ) : null}
        <Box>
          <Button
            variant="contained"
            data-tour="reorder"
            disabled={busy}
            sx={{ minHeight: 48 }}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={async () => {
              if (!need) {
                setOrder(received ?? null)
                return
              }
              setBusy(true)
              const next = await draft(need.item)
              setBusy(false)
              if (next.order) setOrder(next.order)
              else notify(next.note)
            }}
          >
            {need ? s.reorder : s.view}
          </Button>
        </Box>
      </Stack>
      <Sheet open={order !== null} onClose={close} titleId="today-supply-title" title={copy.title}>
        {order && (
          <Suspense fallback={null}>
            <PurchaseOrderCard order={order} onChange={setOrder} />
          </Suspense>
        )}
      </Sheet>
    </>
  )
}
