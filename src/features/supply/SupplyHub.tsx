import { useState, type ReactNode } from 'react'
import { Box, Button, ButtonBase, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import { shape } from '../../design/theme'
import { Sheet } from '../v1/Sheet'
import { useIoCopy } from './ioCopy'
import { useBoard, useIoActions, useUndoableSend } from './ioData'
import type { Board, IoOrder, Unsent, View } from './ioTypes'
import { Card, EntryCard, OrderCard, Section, TaskCard } from './IoParts'
import { counts, onTheWay, useIoFormat, withoutOrders } from './ioFormat'
import { OrderSheet } from './OrderSheet'

const VIEWS: View[] = ['needs', 'coming', 'received', 'send']
const SHOWN = 5

/** Four screens, one owner question each: needs me now, coming in, received, must send. */
export function SupplyHub({
  open,
  onClose,
  initial = 'needs',
}: {
  open: boolean
  onClose: () => void
  initial?: View
}) {
  const c = useIoCopy()
  const { board, failed, refresh } = useBoard(open)
  const [view, setView] = useState<View>(initial)
  const [orderId, setOrderId] = useState<string | null>(null)
  const sendAll = useUndoableSend()
  const actions = useIoActions()
  const n = counts(board)
  const order = board?.orders.find((o) => o.id === orderId) ?? null
  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        titleId="supply-hub-title"
        ask="deliveries"
        title={c.title}
        actions={
          view === 'send' && n.send > 0 ? (
            sendAll.left !== null ? (
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Typography variant="bodyMedium" aria-live="polite">
                  {c.sendingIn(sendAll.left)}
                </Typography>
                <Button variant="contained" onClick={sendAll.undo} sx={{ minHeight: 48 }}>
                  {c.action.undo}
                </Button>
              </Stack>
            ) : (
              <Button
                variant="contained"
                onClick={() => sendAll.start(() => actions.sendAll())}
                sx={{ minHeight: 48 }}
              >
                {c.action.sendAll(n.send)}
              </Button>
            )
          ) : undefined
        }
      >
        <Stack spacing={4}>
          <Box
            role="group"
            aria-label={c.title}
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}
          >
            {VIEWS.map((v) => (
              <ViewButton
                key={v}
                label={c.tabs[v]}
                count={n[v]}
                active={v === view}
                onClick={() => setView(v)}
              />
            ))}
          </Box>
          <Typography variant="titleLarge" component="h3">
            {c.question[view]}
          </Typography>
          {!board ? (
            failed ? (
              <Stack spacing={2} sx={{ alignItems: 'flex-start' }} role="alert">
                <Typography>{c.failed}</Typography>
                <Button variant="outlined" onClick={() => void refresh()} sx={{ minHeight: 48 }}>
                  {c.action.retry}
                </Button>
              </Stack>
            ) : (
              <Stack spacing={2} aria-busy="true" aria-label={c.loading}>
                <Skeleton variant="rounded" height={88} />
                <Skeleton variant="rounded" height={64} />
              </Stack>
            )
          ) : (
            <Screen board={board} view={view} open={setOrderId} />
          )}
        </Stack>
      </Sheet>
      <OrderSheet order={order} open={order !== null} onClose={() => setOrderId(null)} />
    </>
  )
}

/**
 * Buy stock (simplify batch 4b): some of the Supply chain screens on one tab, each under its own
 * question, empty ones left out. To do holds "needs me now" and "must send" (with Send all),
 * On the way holds "coming in" and "received". An order opens in its own sheet, as in the hub.
 * Orders in `skip` (the purchase orders Buy stock shows as their own cards) get no card here.
 */
export function SupplyBoard({
  board,
  views,
  skip,
}: {
  board: Board
  views: View[]
  skip: ReadonlySet<string>
}) {
  const c = useIoCopy()
  const [orderId, setOrderId] = useState<string | null>(null)
  const sendAll = useUndoableSend()
  const actions = useIoActions()
  const rest = withoutOrders(board, skip)
  const n = counts(rest)
  const order = board.orders.find((o) => o.id === orderId) ?? null
  // "Coming in" keeps its demo step even with nothing on the way yet.
  const shown = views.filter(
    (v) => n[v] > 0 || (v === 'coming' && (board.demo || import.meta.env.DEV)),
  )
  return (
    <>
      {shown.map((v) => (
        <Stack key={v} component="section" aria-label={c.question[v]} spacing={2}>
          <Typography variant="titleMedium" component="h3">
            {c.question[v]}
          </Typography>
          <Screen board={rest} view={v} open={setOrderId} quiet />
          {v === 'send' &&
            (sendAll.left !== null ? (
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Typography variant="bodyMedium" aria-live="polite">
                  {c.sendingIn(sendAll.left)}
                </Typography>
                <Button variant="contained" onClick={sendAll.undo} sx={{ minHeight: 48 }}>
                  {c.action.undo}
                </Button>
              </Stack>
            ) : (
              <Button
                variant="contained"
                onClick={() => sendAll.start(() => actions.sendAll())}
                sx={{ alignSelf: 'flex-start', minHeight: 48 }}
              >
                {c.action.sendAll(n.send)}
              </Button>
            ))}
        </Stack>
      ))}
      <OrderSheet order={order} open={order !== null} onClose={() => setOrderId(null)} />
    </>
  )
}

/** Orders the board receives line by line that the purchase order card has no Goods arrived for. */
const AWAITED = new Set(['sent', 'confirmed'])

/**
 * Buy stock: inside one open purchase order, "Delivery from <supplier>" opens the board's sheet to
 * receive it line by line, send the goods receipt and see the supplier's copy. The order has no
 * card of its own on the board there, so this is its only way in.
 */
export function DeliveryButton({ order }: { order: IoOrder | undefined }) {
  const c = useIoCopy()
  const [open, setOpen] = useState(false)
  const awaited =
    order?.direction === 'in' &&
    !order.received &&
    AWAITED.has(order.status) &&
    !order.documents.some((d) => d.direction === 'out' && d.kind === 'RECEIPT')
  // Once open the sheet stays, through the receipt it sends.
  if (!order || (!open && !awaited)) return null
  return (
    <>
      <Button
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{ alignSelf: 'flex-start', minHeight: 48 }}
      >
        {c.task.receive(order.partner.name)}
      </Button>
      <OrderSheet order={order} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** One of a sheet's screens, as a 48 px toggle with its count (Supply chain, Buy stock). */
export function ViewButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  const roles = useTheme().material
  return (
    <ButtonBase
      aria-pressed={active}
      onClick={onClick}
      sx={{
        minHeight: 48,
        px: 3,
        py: 2,
        gap: 2,
        justifyContent: 'space-between',
        borderRadius: `${shape.md}px`,
        border: `1px solid ${active ? roles.secondaryContainer : roles.outlineVariant}`,
        bgcolor: active ? roles.secondaryContainer : 'transparent',
        color: active ? roles.onSecondaryContainer : roles.onSurface,
        typography: 'labelLarge',
        textAlign: 'left',
        '&:focus-visible': { outline: `2px solid ${roles.primary}`, outlineOffset: 2 },
      }}
    >
      <span>{label}</span>
      {count > 0 && (
        <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {count}
        </Box>
      )}
    </ButtonBase>
  )
}

type Item = { key: string; node: ReactNode }

function Screen({
  board,
  view,
  open,
  quiet = false,
}: {
  board: Board
  view: View
  open: (id: string) => void
  /** Inside Buy stock: an empty screen says nothing (the sheet says it once for the tab). */
  quiet?: boolean
}) {
  const c = useIoCopy()
  const f = useIoFormat()
  const actions = useIoActions()
  const order = (o: IoOrder): Item => ({
    key: o.id,
    node: <OrderCard order={o} onOpen={() => open(o.id)} />,
  })
  const groups: { title?: string; items: Item[] }[] =
    view === 'needs'
      ? [
          {
            items: board.tasks.map((task, i) => ({
              key: `${task.code}-${task.order_id ?? task.entry_id}-${i}`,
              node: task.order_id ? (
                <TaskCard task={task} onOpen={() => open(task.order_id!)} />
              ) : (
                <Stack spacing={1}>
                  <TaskCard task={task} />
                  {task.entry_id && (
                    <Button
                      onClick={() => void actions.dismiss(task.entry_id!)}
                      sx={{ alignSelf: 'flex-start', minHeight: 48 }}
                    >
                      {c.action.dismiss}
                    </Button>
                  )}
                </Stack>
              ),
            })),
          },
        ]
      : view === 'coming'
        ? [
            {
              title: c.onTheWay,
              items: board.orders.filter(onTheWay).map(order),
            },
            {
              title: c.fromPartners,
              items: board.inbox.map((entry) => ({
                key: entry.id,
                node: (
                  <EntryCard
                    entry={entry}
                    onOpen={entry.order_id ? () => open(entry.order_id) : undefined}
                  />
                ),
              })),
            },
          ]
        : view === 'received'
          ? [{ items: board.orders.filter((o) => o.direction === 'in' && o.received).map(order) }]
          : [
              {
                items: board.unsent.map((row: Unsent) => ({
                  key: `${row.order_id}-${row.kind}`,
                  node: (
                    <Card
                      title={row.partner}
                      chip={row.short.length ? 'problem' : 'needs_you'}
                      amount={
                        row.lines[0]
                          ? `${f.qty(row.lines[0].quantity)} ${f.unit(row.lines[0].unit)}`
                          : undefined
                      }
                      detail={[c.kind[row.kind], f.item(row.lines[0]?.item)]
                        .filter(Boolean)
                        .join(' · ')}
                      onOpen={() => open(row.order_id)}
                    />
                  ),
                })),
              },
            ]
  const filled = groups.filter((group) => group.items.length)
  return (
    <Stack spacing={4}>
      {filled.length === 0 && !quiet && (
        <Typography color="text.secondary">
          {board.orders.length === 0 && board.inbox.length === 0 ? c.noPartnersHint : c.empty[view]}
        </Typography>
      )}
      {filled.map((group) => (
        <Group key={group.title ?? view} title={group.title} items={group.items} />
      ))}
      {view === 'coming' && (board.demo || import.meta.env.DEV) && (
        <Button
          variant="outlined"
          onClick={() => void actions.demoNext()}
          sx={{ alignSelf: 'flex-start', minHeight: 48 }}
        >
          {c.action.demo}
        </Button>
      )}
    </Stack>
  )
}

/** At most five cards open at once; the rest behind "Show all items" (UX rule 3). */
function Group({ title, items }: { title?: string; items: Item[] }) {
  const c = useIoCopy()
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, SHOWN)
  return (
    <Stack spacing={2}>
      <Section title={title}>
        {shown.map((item) => (
          <li key={item.key}>{item.node}</li>
        ))}
      </Section>
      {items.length > SHOWN && (
        <Button onClick={() => setAll(!all)} sx={{ alignSelf: 'flex-start', minHeight: 48 }}>
          {all ? c.showFewer : c.showAll(items.length)}
        </Button>
      )}
    </Stack>
  )
}
