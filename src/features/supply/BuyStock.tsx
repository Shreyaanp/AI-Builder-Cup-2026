import { useState } from 'react'
import { Box, IconButton, Skeleton, Stack, Typography } from '@mui/material'
import { ArrowLeft, Truck } from 'lucide-react'
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
import { useBoard } from './ioData'
import { counts } from './ioFormat'
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
  const { orders, refresh: refreshOrders } = useOrders(live)
  const n = counts(board)
  const pos = supply?.orders ?? []
  const chats = orders ?? []
  return {
    board,
    failed,
    refreshBoard,
    orders: chats,
    refreshOrders,
    loaded: supply !== null && board !== null && orders !== null,
    // A read that failed says so (and retries), never "–" as if there were no orders (OB-248).
    supplyFailed: supply === null && supplyFailed,
    toDo:
      pos.filter((order) => PO_TO_DO.has(order.status)).length +
      n.needs +
      n.send +
      chats.filter((order) => order.status === 'needs_reply').length,
    coming:
      n.coming +
      chats.filter((order) => order.status === 'sent' || order.status === 'confirmed').length,
  }
}

/**
 * Grow's Buy stock row (simplify batch 4b): what was Orders, Purchase orders, Supply chain and the
 * "runs out" card, in one sheet with tabs To do · On the way · My suppliers · Find a supplier.
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
  const line = [runsOut?.label, stock.toDo ? grow.toDo(stock.toDo) : ''].filter(Boolean).join(' · ')
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
      <BuyStockSheet tab={tab} onTab={onTab} stock={stock} hasRunsOut={runsOut !== null} />
    </>
  )
}

function BuyStockSheet({
  tab,
  onTab,
  stock,
  hasRunsOut,
}: {
  tab: StockTab | null
  onTab: (tab: StockTab | null) => void
  stock: ReturnType<typeof useStock>
  hasRunsOut: boolean
}) {
  const grow = useGrowCopy()
  const paths = useTwoPathsCopy()
  const t = useCopy()
  const [drill, setDrill] = useState<Drill>(null)
  const close = () => {
    setDrill(null)
    onTab(null)
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
              {!drill && <RunsOutCard onAct={close} />}
              {!drill && stock.loaded && count.todo === 0 && (
                <Typography variant="bodyLarge" color="text.secondary">
                  {grow.nothingToDo}
                </Typography>
              )}
              <Box sx={{ display: away('po-todo') }}>
                <PurchaseOrders part="todo" onDrill={setDrill} onLeave={close} />
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
                (loading ?? (board && <SupplyBoard board={board} views={['needs', 'send']} />))}
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
                  (board && <SupplyBoard board={board} views={['coming', 'received']} />))}
              <Box sx={{ display: away('orders') }}>
                <SupplierOrders
                  orders={stock.orders.filter((order) => order.status !== 'needs_reply')}
                  refresh={stock.refreshOrders}
                  onDrill={setDrill}
                  onLeave={close}
                />
              </Box>
              <Box sx={{ display: away('po-coming') }}>
                <PurchaseOrders part="coming" onDrill={setDrill} onLeave={close} />
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
