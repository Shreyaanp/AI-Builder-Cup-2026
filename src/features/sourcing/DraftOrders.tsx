import { Stack, Typography } from '@mui/material'
import { useWorkspace } from '../v1/workspaceContext'
import { useCopy } from '../v1/strings'
import { supplyChanged } from '../supply/supplyEvents'
import { useSourcingCopy } from './copy'
import { OrderCard } from './SourcingCards'
import type { Order } from './types'

/**
 * Buy stock → To do: order requests made in the chat that have not been sent. They were only on
 * the chat card, so To do said "nothing to do" while one waited (Ramesh, 8 Nov).
 */
export function DraftOrders({
  orders,
  refresh,
}: {
  orders: Order[]
  refresh: () => Promise<boolean>
}) {
  const s = useSourcingCopy()
  const t = useCopy()
  const { api, activeId, notify } = useWorkspace()
  if (!orders.length) return null
  const path = (order: Order, action: string) =>
    `/businesses/${encodeURIComponent(activeId ?? '')}/orders/${encodeURIComponent(order.id)}/${action}`
  async function act(order: Order, action: 'send' | 'discard') {
    try {
      await api<Order>(path(order, action), {
        method: 'POST',
        body: JSON.stringify({ version: order.version }),
      })
      supplyChanged()
      await refresh()
      return true
    } catch {
      notify(t.actionFailed)
      await refresh()
      return false
    }
  }
  return (
    <Stack component="section" aria-label={s.orderRequest} spacing={2} data-testid="draft-orders">
      <Typography variant="titleMedium" component="h3">
        {s.orderRequest}
      </Typography>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          onSend={(next) => act(next, 'send')}
          onDiscard={async (next) => void (await act(next, 'discard'))}
          onOpen={() => undefined}
          onReceived={() => undefined}
          onChanged={() => void refresh()}
        />
      ))}
    </Stack>
  )
}
