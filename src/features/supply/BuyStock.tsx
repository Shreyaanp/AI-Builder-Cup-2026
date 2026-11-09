import { useEffect, useState } from 'react'
import { Box, Button, IconButton, Skeleton, Stack, Typography } from '@mui/material'
import { ArrowLeft, ShoppingBasket, Truck } from 'lucide-react'
import { ThingsIBuySheet } from '../shop/ThingsIBuySheet'
import { onMenu } from '../shop/stock'
import { useStockCopy } from '../shop/stockCopy'
import { useWorkspace } from '../v1/workspaceContext'
import { track } from '../../app/analytics'
import { RunsOutCard } from '../forecast/PrepPlan'
import { useRunsOut } from '../forecast/forecastData'
import { SupplierOrders } from '../sourcing/Orders'
import { useOrders } from '../sourcing/orderData'
import { TileLayoutContext } from '../v1/growLayout'
import { useGrowCopy } from '../v1/growCopy'
import { Sheet } from '../v1/Sheet'
import { Tile } from '../v1/ShopTiles'
import { FindSupplier } from '../v1/TwoPaths'
import { useTwoPathsCopy } from '../v1/twoPathsCopy'
import { useCopy } from '../v1/strings'
import { DraftOrders } from '../sourcing/DraftOrders'
import { useBoard } from './ioData'
import { HowMuch, OrderBox, ToOrderRows } from './OrderMore'
import { PurchaseOrderCard } from './PurchaseOrderCard'
import { buyStockBus } from './supplyEvents'
import type { PurchaseOrder } from './types'
import type { OrderAsk } from './supplyData'
import { productName } from '../../i18n/productNames'
import { useLocale } from '../../state/hooks'
import { orderLabel } from './orderFormat'
import { counts, ON_THE_WAY, withoutOrders } from './ioFormat'
import { PO_TO_DO } from './orderFormat'
import { PurchaseOrders, type Drill } from './Supply'
import { SupplyBoard, ViewButton } from './SupplyHub'
import { useSupplyCopy } from './copy'
import { useSupply } from './supplyData'

export type StockTab = 'todo' | 'coming' | 'suppliers' | 'find'
const TABS: StockTab[] = ['todo', 'coming', 'suppliers', 'find']

/** What waits for the owner and what is on its way, across both order systems. */
function useStock(live: boolean) {
  const { data: supply, failed: supplyFailed } = useSupply(true)
  const { board, failed, refresh: refreshBoard } = useBoard(true)
  // With unsent drafts: an order waiting for Send is To do, never "nothing to do" (Ramesh, 8 Nov).
  const { orders, refresh: refreshOrders } = useOrders(live, true)
  // One card per order (UX rules §5, §10): the shop's own orders show as purchase orders, an
  // order to the shop (it ships, it sends the notice) as the board's card.
  const theirs = new Set(board?.orders.filter((o) => o.direction === 'out').map((o) => o.id))
  const pos = (supply?.orders ?? []).filter((order) => !theirs.has(order.id))
  const skip = new Set(pos.map((order) => order.id))
  const n = counts(board && withoutOrders(board, skip))
  const chats = orders ?? []
  const toOrder = supply?.to_order ?? []
  return {
    board,
    skip,
    theirs,
    failed,
    refreshBoard,
    orders: chats,
    toOrder,
    refreshOrders,
    loaded: supply !== null && board !== null && orders !== null,
    // A read that failed says so (and retries), never "–" as if there were no orders (OB-248).
    supplyFailed: supply === null && supplyFailed,
    toDo:
      pos.filter((order) => PO_TO_DO.has(order.status)).length +
      n.needs +
      n.send +
      toOrder.length +
      chats.filter((order) => order.status === 'needs_reply' || order.status === 'draft').length,
    coming:
      pos.filter(
        (order) => !PO_TO_DO.has(order.status) && ON_THE_WAY.has(order.status) && !order.received,
      ).length +
      n.coming +
      chats.filter((order) => order.status === 'sent' || order.status === 'confirmed').length,
  }
}

/**
 * The Buy stock row on Shop (simplify batch 4b, moved from Grow for OB-267): what was Orders,
 * Purchase orders, Supply chain and the "runs out" card, in one sheet with tabs To do · On the
 * way · My suppliers · Find a supplier.
 * The row's line says what needs buying now ("Tea dust runs out Thu · 1 to do", OB-254).
 */
export function BuyStockRow({
  tab,
  onTab,
}: {
  tab: StockTab | null
  onTab: (tab: StockTab | null) => void
}) {
  const grow = useGrowCopy()
  const s = useSupplyCopy()
  const runsOut = useRunsOut()
  const stock = useStock(tab !== null)
  // "Things I buy" with their stock, one tap from here (OB-310); sheets never stack.
  const [things, setThings] = useState(false)
  // "Order more" on a menu item or a thing I buy lands on "how much?" in this sheet.
  const [ask, setAsk] = useState<string | null>(null)
  useEffect(() => {
    const open = (event: Event) => {
      setAsk((event as CustomEvent<string>).detail || null)
      onTab('todo')
    }
    buyStockBus.addEventListener('open', open)
    return () => buyStockBus.removeEventListener('open', open)
  }, [onTab])
  const line = [runsOut?.short, stock.toDo ? grow.toDo(stock.toDo) : ''].filter(Boolean).join(' · ')
  return (
    <>
      <Tile
        tour="supply"
        icon={<Truck size={20} />}
        label={grow.stock}
        value={
          stock.supplyFailed
            ? s.loadFailed
            : !stock.loaded && !runsOut
              ? '–'
              : line || (stock.coming ? grow.onTheWay(stock.coming) : grow.stockIdle)
        }
        onClick={() => {
          track('purchase_orders_opened')
          onTab('todo')
        }}
      />
      <BuyStockSheet
        tab={tab}
        onTab={onTab}
        stock={stock}
        hasRunsOut={runsOut !== null && !runsOut.arriving}
        asked={ask}
        onAsked={() => setAsk(null)}
        onThingsIBuy={() => {
          onTab(null)
          setThings(true)
        }}
      />
      <ThingsIBuySheet
        open={things}
        onClose={() => setThings(false)}
        onBuyStock={() => onTab('todo')}
      />
    </>
  )
}

function BuyStockSheet({
  tab,
  onTab,
  stock,
  hasRunsOut,
  asked,
  onAsked,
  onThingsIBuy,
}: {
  tab: StockTab | null
  onTab: (tab: StockTab | null) => void
  stock: ReturnType<typeof useStock>
  hasRunsOut: boolean
  /** An item to ask "how much?" about as the sheet opens. */
  asked: string | null
  onAsked: () => void
  onThingsIBuy: () => void
}) {
  const grow = useGrowCopy()
  const paths = useTwoPathsCopy()
  const t = useCopy()
  const stockCopy = useStockCopy()
  const ws = useWorkspace()
  const bought = ws.products.filter((product) => !onMenu(product)).length
  const [drill, setDrill] = useState<Drill>(null)
  const [ask, setAsk] = useState<OrderAsk | null>(null)
  const [drafted, setDrafted] = useState<PurchaseOrder | null>(null)
  const locale = useLocale()
  const s = useSupplyCopy()
  const close = () => {
    setDrill(null)
    setAsk(null)
    onAsked()
    setDrafted(null)
    onTab(null)
  }
  // The new draft opens in place, with the way back in the title like any open order.
  const showDraft = (order: PurchaseOrder) => {
    setAsk(null)
    onAsked()
    setDrafted(order)
    setDrill({
      from: 'new',
      title: orderLabel(order, s.orderTitle, (item) => productName(item, locale)),
      back: () => {
        setDrafted(null)
        setDrill(null)
      },
    })
  }
  // Order more on an item elsewhere: its "how much?" once the list knows the item.
  const asking = ask ?? stock.toOrder.find((row) => row.item === asked) ?? null
  const stopAsking = () => {
    setAsk(null)
    onAsked()
  }
  // While one order is open, only the part that opened it shows.
  const away = (from: string) => (drill !== null && drill.from !== from ? 'none' : undefined)
  const label: Record<StockTab, string> = {
    todo: grow.todo,
    coming: grow.coming,
    suppliers: grow.suppliers,
    find: paths.findSupplier,
  }
  const count: Record<StockTab, number> = {
    todo: stock.toDo + (hasRunsOut ? 1 : 0),
    coming: stock.coming,
    suppliers: 0,
    find: 0,
  }
  const board = stock.board
  const loading = !board ? (
    stock.failed ? (
      <Typography role="alert">{t.actionFailed}</Typography>
    ) : (
      <Stack spacing={2} aria-busy="true">
        <Skeleton variant="rounded" height={88} />
        <Skeleton variant="rounded" height={64} />
      </Stack>
    )
  ) : null
  return (
    <Sheet
      open={tab !== null}
      onClose={close}
      titleId="buy-stock-title"
      ask="supply"
      title={
        drill ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <IconButton aria-label={grow.stock} onClick={drill.back} sx={{ ml: -2 }}>
              <ArrowLeft size={20} />
            </IconButton>
            <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {drill.title}
            </Box>
          </Stack>
        ) : (
          grow.stock
        )
      }
    >
      {/* Rows outside Grow's list: the runs-out card is a card here, not a list row. */}
      <TileLayoutContext.Provider value="card">
        <Stack spacing={4}>
          {!drill && (
            <Box
              role="group"
              aria-label={grow.stock}
              sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}
            >
              {TABS.map((t) => (
                <ViewButton
                  key={t}
                  label={label[t]}
                  count={count[t]}
                  active={t === tab}
                  onClick={() => onTab(t)}
                />
              ))}
            </Box>
          )}
          {tab === 'todo' && (
            <>
              {drafted && <PurchaseOrderCard order={drafted} onChange={setDrafted} />}
              {!drill &&
                (asking ? (
                  <HowMuch
                    key={asking.item}
                    ask={asking}
                    onOrder={showDraft}
                    onCancel={stopAsking}
                  />
                ) : (
                  <OrderBox onOrder={showDraft} onAsk={setAsk} />
                ))}
              {!drill && <ToOrderRows asks={stock.toOrder} onAsk={setAsk} />}
              {!drill && <RunsOutCard onAct={close} />}
              {!drill && bought > 0 && (
                <Button
                  variant="outlined"
                  aria-haspopup="dialog"
                  startIcon={<ShoppingBasket size={18} />}
                  onClick={onThingsIBuy}
                  sx={{ alignSelf: 'flex-start', minHeight: 48 }}
                >
                  {stockCopy.thingsIBuy} · {stockCopy.thingsIBuyCount(bought)}
                </Button>
              )}
              {!drill && stock.loaded && count.todo === 0 && (
                <Typography variant="bodyLarge" color="text.secondary">
                  {grow.nothingToDo}
                </Typography>
              )}
              {!drill && (
                <DraftOrders
                  orders={stock.orders.filter((order) => order.status === 'draft')}
                  refresh={stock.refreshOrders}
                />
              )}
              <Box sx={{ display: away('po-todo') }}>
                <PurchaseOrders
                  part="todo"
                  hide={stock.theirs}
                  board={board}
                  onDrill={setDrill}
                  onLeave={close}
                />
              </Box>
              <Box sx={{ display: away('orders') }}>
                <SupplierOrders
                  orders={stock.orders.filter((order) => order.status === 'needs_reply')}
                  refresh={stock.refreshOrders}
                  onDrill={setDrill}
                  onLeave={close}
                />
              </Box>
              {!drill &&
                (loading ??
                  (board && (
                    <SupplyBoard board={board} views={['needs', 'send']} skip={stock.skip} />
                  )))}
            </>
          )}
          {tab === 'coming' && (
            <>
              {!drill && stock.loaded && stock.coming === 0 && (
                <Typography variant="bodyLarge" color="text.secondary">
                  {grow.nothingComing}
                </Typography>
              )}
              {!drill &&
                (loading ??
                  (board && (
                    <SupplyBoard board={board} views={['coming', 'received']} skip={stock.skip} />
                  )))}
              <Box sx={{ display: away('orders') }}>
                <SupplierOrders
                  orders={stock.orders.filter(
                    (order) => order.status !== 'needs_reply' && order.status !== 'draft',
                  )}
                  refresh={stock.refreshOrders}
                  onDrill={setDrill}
                  onLeave={close}
                />
              </Box>
              <Box sx={{ display: away('po-coming') }}>
                <PurchaseOrders
                  part="coming"
                  hide={stock.theirs}
                  board={board}
                  onDrill={setDrill}
                  onLeave={close}
                />
              </Box>
            </>
          )}
          {tab === 'suppliers' && (
            <PurchaseOrders part="suppliers" onDrill={setDrill} onLeave={close} />
          )}
          {tab === 'find' && <FindSupplier onStart={close} />}
        </Stack>
      </TileLayoutContext.Provider>
    </Sheet>
  )
}
