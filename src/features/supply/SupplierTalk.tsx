import { useEffect } from 'react'
import { Box, Stack, Typography, useTheme } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { shape } from '../../design/theme'
import { productName } from '../../i18n/productNames'
import { formatShopPrice } from '../v1/format'
import { dayLabel } from './supplyData'
import { useSupplierTalkCopy } from './supplierTalkCopy'
import type { PurchaseOrder, SupplyDocument } from './types'

const POLL_MS = 2000

type Line = {
  item: string
  quantity: number
  unit: string
  price?: number | null
  status?: string
  backorder_quantity?: number | null
  backorder_date?: string | null
}

const linesOf = (document: SupplyDocument | undefined): Line[] => document?.canonical?.lines ?? []

/** A demo order the visitor sent themselves, while the scripted supplier still owes a reply. */
function waitingForDemoSupplier(order: PurchaseOrder): boolean {
  if (!order.simulated || order.documents[0]?.reader !== 'template') return false
  return (
    order.status === 'sent' ||
    order.status === 'confirmed' ||
    (order.status === 'received' && !order.invoiced)
  )
}

/**
 * The order as a conversation with the demo supplier, in the owner's language (OB-248). Each
 * message comes from a document on the order, so what it says always matches the order. While a
 * reply is due it checks every couple of seconds; the server delivers the reply when it is time.
 */
export function SupplierTalk({
  order,
  refresh,
}: {
  order: PurchaseOrder
  refresh: (order: PurchaseOrder) => Promise<void>
}) {
  const c = useSupplierTalkCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const waiting = waitingForDemoSupplier(order)
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => void refresh(order), POLL_MS)
    return () => window.clearInterval(timer)
  }, [waiting, order, refresh])

  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const money = (minor: number | null | undefined) =>
    minor == null ? '' : formatShopPrice(minor, order.currency, locale)
  const size = (line: { quantity: number; unit: string; item: string }) =>
    `${number.format(line.quantity)} ${line.unit} ${productName(line.item, locale)}`
  const list = order.lines.map(size).join(', ')
  const day = order.delivery ? dayLabel(order.delivery, locale) : ''

  const messages: { key: string; at: number; mine: boolean; text: string }[] = []
  for (const document of order.documents) {
    const base = { key: document.id, at: document.at }
    if (document.kind === 'ORDERS' && document.from === 'buyer') {
      messages.push({ ...base, mine: true, text: c.ask(list, day) })
    } else if (document.kind === 'ORDRSP') {
      const short = linesOf(document).find((line) => line.status === 'backordered')
      const dearer = linesOf(document).find((line) => {
        const asked = order.lines.find((row) => row.item === line.item)
        return asked?.price != null && line.price != null && line.price !== asked.price
      })
      if (short) {
        messages.push({
          ...base,
          mine: false,
          text: c.short(
            `${number.format(short.quantity)} ${short.unit}`,
            productName(short.item, locale),
            `${number.format(short.backorder_quantity ?? 0)} ${short.unit}`,
            dayLabel(short.backorder_date ?? '', locale),
          ),
        })
      } else if (dearer) {
        const asked = order.lines.find((row) => row.item === dearer.item)
        messages.push({
          ...base,
          mine: false,
          text: c.dearer(
            productName(dearer.item, locale),
            money(dearer.price),
            money(asked?.price),
            dearer.unit,
          ),
        })
      } else {
        messages.push({ ...base, mine: false, text: c.yes(list, day) })
      }
      if ((short || dearer) && order.status !== 'changed') {
        messages.push({ key: `${document.id}-ok`, at: document.at + 1, mine: true, text: c.okay })
      }
    } else if (document.kind === 'DESADV' && document.from === 'supplier') {
      messages.push({ ...base, mine: false, text: c.onWay(day) })
    } else if (document.kind === 'INVOIC') {
      messages.push({ ...base, mine: false, text: c.bill(money(document.canonical?.total)) })
    }
  }
  if (order.received) {
    const at = order.received_at ?? Number.MAX_SAFE_INTEGER
    messages.push({ key: 'received', at, mine: true, text: c.gotIt })
  }
  messages.sort((a, b) => a.at - b.at)

  return (
    <Box component="section" aria-label={c.heading(order.supplier.name)}>
      <Typography variant="titleSmall" component="h3" sx={{ mb: 2 }}>
        {c.heading(order.supplier.name)}
      </Typography>
      <Stack spacing={2} role="log" aria-live="polite" data-testid="supplier-talk">
        {messages.map((message) => (
          <Typography
            key={message.key}
            variant="bodyMedium"
            sx={{
              alignSelf: message.mine ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              px: 3,
              py: 2,
              overflowWrap: 'anywhere',
              borderRadius: `${shape.md}px`,
              bgcolor: message.mine ? roles.primaryContainer : roles.surfaceContainerHigh,
              color: message.mine ? roles.onPrimaryContainer : roles.onSurface,
            }}
          >
            {message.text}
          </Typography>
        ))}
        {order.status === 'sent' && waiting && (
          <Typography variant="bodyMedium" color="text.secondary">
            {c.waiting(order.supplier.name)}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
