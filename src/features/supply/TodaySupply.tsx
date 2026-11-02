import { Suspense, useState } from 'react'
import { Box, Button, CircularProgress, Stack, Typography, useTheme } from '@mui/material'
import { Truck } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { useWorkspace } from '../v1/workspaceContext'
import { Sheet } from '../v1/Sheet'
import { PurchaseOrderCard } from './supplyDeferred'
import { useShowcaseCopy } from './showcaseCopy'
import { useSupplyCopy } from './copy'
import { useOrderChangeCopy } from './orderChangeCopy'
import { dayLabel, useDraftReorder, useOnOrderText, useTodaySupplyLead } from './supplyData'
import type { PurchaseOrder } from './types'
import { productFeminine, productName } from '../../i18n/productNames'

/**
 * Today's one stock line (HABIT change 2): a row of "Needs you now" with the run-out day the
 * brief and Grow show for the same item (OB-238). Its Reorder is filled only when it leads.
 */
export function TodaySupply({ first, onAct }: { first: boolean; onAct?: () => void }) {
  const { active, notify } = useWorkspace()
  const { refresh, need, more, received, item } = useTodaySupplyLead()
  const draft = useDraftReorder()
  const s = useShowcaseCopy()
  const copy = useSupplyCopy()
  const c = useOrderChangeCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [busy, setBusy] = useState(false)
  // "2 pack Milk is already on order… Order more anyway?", with the item to order (#603).
  const [ask, setAsk] = useState<{ item: string; note: string } | null>(null)
  const onOrderText = useOnOrderText()
  if (!active || !item) return null
  const close = () => {
    setOrder(null)
    void refresh()
  }
  const onOrder = need ? onOrderText(need) : ''
  return (
    <Box
      component="li"
      data-need="supply"
      data-tour="today-supply"
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest('button')) onAct?.()
      }}
    >
      {/* A named region inside the row: screen readers (and tests) find "Supply chain". */}
      <Box
        component="section"
        aria-label={s.title}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 3,
          rowGap: 1,
          px: 1,
          py: 2,
          minHeight: 56,
        }}
      >
        <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary, flexShrink: 0 }}>
          <Truck size={20} />
        </Box>
        <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
          <Typography
            variant="bodyLarge"
            aria-live="polite"
            sx={{ overflowWrap: 'anywhere', fontWeight: 500 }}
          >
            {need
              ? s.runsOutLine(
                  productName(item, locale),
                  dayLabel(need.runs_out, locale),
                  productFeminine(item, locale),
                )
              : `${productName(item, locale)} ${s.restocked}`}
          </Typography>
          {onOrder ? (
            <Typography variant="bodyMedium" sx={{ color: roles.onSurfaceVariant }}>
              {onOrder}
            </Typography>
          ) : null}
          {more > 0 && (
            <Typography variant="bodyMedium" sx={{ color: roles.onSurfaceVariant }}>
              {c.moreRunOut(more)}
            </Typography>
          )}
        </Box>
        {ask ? (
          <Stack spacing={2} role="group" aria-label={ask.note} sx={{ flexBasis: '100%' }}>
            <Typography variant="bodyLarge" role="status">
              {ask.note}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
              <Button
                variant="contained"
                disabled={busy}
                sx={{ minHeight: 48 }}
                onClick={async () => {
                  setBusy(true)
                  const next = await draft(ask.item, true)
                  setBusy(false)
                  setAsk(null)
                  if (next.order) setOrder(next.order)
                  else notify(next.note)
                }}
              >
                {c.orderMore}
              </Button>
              <Button sx={{ minHeight: 48 }} onClick={() => setAsk(null)}>
                {c.notNow}
              </Button>
            </Stack>
          </Stack>
        ) : null}
        {!ask && (
          <Stack direction="row" sx={{ gap: 1, flexShrink: 0, ml: 'auto' }}>
            <Button
              variant={first ? 'contained' : 'text'}
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
                else if (next.ask) setAsk({ item: next.ask, note: next.note })
                else notify(next.note)
              }}
            >
              {need ? s.reorder : s.view}
            </Button>
          </Stack>
        )}
      </Box>
      <Sheet open={order !== null} onClose={close} titleId="today-supply-title" title={copy.title}>
        {order && (
          <Suspense fallback={null}>
            <PurchaseOrderCard order={order} onChange={setOrder} />
          </Suspense>
        )}
      </Sheet>
    </Box>
  )
}
