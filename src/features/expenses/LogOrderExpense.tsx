import { useEffect, useState } from 'react'
import { Button, CircularProgress, Typography, useTheme } from '@mui/material'
import { Check, Wallet } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { formatShopPrice, toMajor } from '../v1/format'
import { useWorkspace } from '../v1/workspaceContext'
import { moneyCopyFor } from './copy'

/**
 * A received supplier order noted as today's stock expense in one tap. The server keeps one
 * expense per order, so a second tap (or a second phone) never counts it twice, and the card
 * asks the server, so it still says "noted" after a reload. Paid in cash by default; the owner
 * changes it on the close screen.
 */
export function LogOrderExpense({
  orderId,
  supplier,
  total,
  currency,
}: {
  orderId: string
  supplier: string
  total: number | null
  currency: string
}) {
  const ws = useWorkspace()
  const locale = useLocale()
  const m = moneyCopyFor(locale)
  const roles = useTheme().material
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')
  const [noted, setNoted] = useState<number | null>(null)
  const shop = ws.active
  const shown = Boolean(shop && total && total > 0 && !ws.demo)
  const shopId = shop?.id
  const { api } = ws
  useEffect(() => {
    if (!shown || !shopId) return
    const controller = new AbortController()
    api<{ noted: boolean; amount: number | null }>(
      `/businesses/${encodeURIComponent(shopId)}/expenses/order/${encodeURIComponent(orderId)}`,
      { signal: controller.signal },
    )
      .then((found) => {
        if (!controller.signal.aborted && found.noted) setNoted(found.amount)
      })
      // Not known: the button stays, and the server still counts the order once.
      .catch(() => undefined)
    return () => controller.abort()
  }, [api, shopId, orderId, shown])
  if (!shop || !total || total <= 0 || ws.demo) return null
  const amount = formatShopPrice(noted ?? total, currency, locale)
  if (state === 'done' || noted !== null)
    return (
      <Typography
        role="status"
        variant="bodyMedium"
        sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}
      >
        <Check size={18} aria-hidden="true" color={roles.primary} />
        {m.logged(amount)}
      </Typography>
    )
  return (
    <>
      <Button
        variant="outlined"
        disabled={state === 'busy'}
        startIcon={
          state === 'busy' ? <CircularProgress size={16} color="inherit" /> : <Wallet size={18} />
        }
        onClick={() => {
          setState('busy')
          ws.api(`/businesses/${encodeURIComponent(shop.id)}/expenses`, {
            method: 'POST',
            body: JSON.stringify({
              amount: toMajor(total, currency),
              category: 'stock',
              note: supplier,
              method: 'cash',
              order_id: orderId,
            }),
          })
            .then(() => setState('done'))
            .catch(() => setState('failed'))
        }}
        sx={{ alignSelf: 'flex-start', minHeight: 48 }}
      >
        {m.logOrder(amount)}
      </Button>
      {state === 'failed' && (
        <Typography role="alert" variant="bodyMedium" sx={{ color: roles.error }}>
          {m.failed}
        </Typography>
      )}
    </>
  )
}
