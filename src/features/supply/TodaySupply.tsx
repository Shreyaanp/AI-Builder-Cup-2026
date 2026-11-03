import { Suspense, useState, type ReactNode } from 'react'
import { Box, Button, CircularProgress, Stack, Typography, useTheme } from '@mui/material'
import { NotebookPen, Truck } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { useWorkspace } from '../v1/workspaceContext'
import { Sheet } from '../v1/Sheet'
import { PurchaseOrderCard } from './supplyDeferred'
import { useShowcaseCopy } from './showcaseCopy'
import { useSupplyCopy } from './copy'
import { useOrderChangeCopy } from './orderChangeCopy'
import {
  dayLabel,
  onItsWay,
  stillShort,
  useDraftReorder,
  useOnOrderText,
  useOrderUnit,
  useTodaySupplyLead,
} from './supplyData'
import type { PurchaseOrder } from './types'
import { productFeminine, productName } from '../../i18n/productNames'

/** Last night's promise names this item: the row says it, and Reorder answers it. */
export type SupplyPromise = {
  said: string
  /** Called as Reorder is tapped, before the purchase order is drafted. */
  onReorder: () => void
  /** "Not today", after Reorder. */
  extra: ReactNode
  busy: boolean
}

/**
 * Today's one stock line (HABIT change 2): a row of "Needs you now" with the run-out day the
 * brief and Grow show for the same item (OB-238). Its Reorder is filled only when it leads.
 * When last night's promise names the item, this is the promise row: one row, one order path.
 * Once ordered it says "19 kg arriving Wed ✓" with no Reorder, and "Order more" (a text button)
 * only while what is coming does not cover it; once the goods came, "stock topped up" once
 * (OB-263).
 */
export function TodaySupply({
  first,
  onAct,
  promise,
}: {
  first: boolean
  onAct?: () => void
  promise?: SupplyPromise
}) {
  const { active, notify, products } = useWorkspace()
  const { refresh, need, more, topped, item } = useTodaySupplyLead()
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
  const arrivingText = useOnOrderText(true)
  const unit = useOrderUnit()
  if (!active || !item) return null
  const close = () => {
    setOrder(null)
    void refresh()
  }
  const name = productName(item, locale)
  const coming = onItsWay(need)
  // Ordered and enough on its way: nothing to tap. Some on its way but not enough: Order more.
  const orderMore = coming && stillShort(need)
  const saved = products.find((p) => p.name === item)?.unit ?? ''
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const headline = topped
    ? c.toppedUp(name, `${number.format(topped.stock)} ${unit(saved)}`)
    : need && coming
      ? `${name}: ${arrivingText(need)}`
      : need
        ? s.runsOutLine(name, dayLabel(need.runs_out, locale), productFeminine(item, locale))
        : ''
  const detail =
    need && !coming
      ? onOrderText(need)
      : orderMore && need?.runs_out
        ? c.stillRunsOut(dayLabel(need.runs_out, locale), productFeminine(item, locale))
        : ''
  const reorder = Boolean(need && (!coming || orderMore))
  return (
    <Box
      component="li"
      data-need={promise ? 'promise' : 'supply'}
      data-tour="today-supply"
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest('button')
        if (button && !button.hasAttribute('data-uncounted')) onAct?.()
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
          py: 1,
          minHeight: 56,
        }}
      >
        <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary, flexShrink: 0 }}>
          {promise ? <NotebookPen size={20} /> : <Truck size={20} />}
        </Box>
        <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
          {promise && (
            <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere', fontWeight: 500 }}>
              {promise.said}
            </Typography>
          )}
          <Typography
            variant="bodyLarge"
            aria-live="polite"
            data-testid="today-supply-line"
            sx={{ overflowWrap: 'anywhere', fontWeight: promise ? undefined : 500 }}
          >
            {headline}
          </Typography>
          {detail ? (
            <Typography variant="bodyMedium" sx={{ color: roles.onSurfaceVariant }}>
              {detail}
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
        {!ask && (reorder || promise?.extra) && (
          <Stack direction="row" sx={{ gap: 1, flexShrink: 0, ml: 'auto' }}>
            {need && reorder && (
              <Button
                // Ordering more on top of an order is never the lead action (OB-263).
                variant={first && !coming ? 'contained' : 'text'}
                data-tour="reorder"
                disabled={busy || promise?.busy}
                sx={{ minHeight: 48 }}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                onClick={async () => {
                  promise?.onReorder()
                  setBusy(true)
                  const next = await draft(need.item)
                  setBusy(false)
                  if (next.order) setOrder(next.order)
                  else if (next.ask) setAsk({ item: next.ask, note: next.note })
                  else notify(next.note)
                }}
              >
                {coming ? c.orderMore : s.reorder}
              </Button>
            )}
            {promise?.extra}
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
