import { useState } from 'react'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { CircleCheck, ClipboardList, TriangleAlert } from 'lucide-react'
import { shape } from '../../design/theme'
import { useIoCopy } from './ioCopy'
import { useBoard, useIoActions, useUndoableSend } from './ioData'
import type { IoOrder, View } from './ioTypes'
import { OrderCard } from './IoParts'
import { OnceOpened } from '../../app/OnceOpened'
import { OrderSheet, SupplyHub } from './supplyDeferred'

/** The shop's own date, as the board's ISO days are. */
function localDay(): string {
  return new Date().toLocaleDateString('en-CA')
}

/**
 * Today: exceptions float up (shortages, changes, late, unsent); on-time documents stay quiet.
 * Inside "Needs you now" (`inCard`) they are rows of the one list, in plain words: no second
 * "N things need you now" block and no order numbers (those stay behind Open). A delivery
 * waits quietly until its day (OB-263).
 */
export function TodaySupplyNeeds({ inCard = false }: { inCard?: boolean }) {
  const c = useIoCopy()
  const roles = useTheme().material
  const { board } = useBoard(true)
  const [open, setOpen] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)
  const today = localDay()
  const tasks = (board?.tasks ?? []).filter((task) => {
    if (task.code !== 'receive') return true
    const delivery = board?.orders.find((o) => o.id === task.order_id)?.delivery ?? ''
    return !delivery || delivery <= today
  })
  if (!tasks.length) return null
  const order = board?.orders.find((o) => o.id === orderId) ?? null
  return (
    <>
      <Box
        component="ul"
        aria-label={c.question.needs}
        data-testid="today-supply-needs"
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          '& > li + li': { borderTop: `1px solid ${roles.outlineVariant}` },
          ...(inCard
            ? { borderTop: `1px solid ${roles.outlineVariant}` }
            : { px: 3, borderRadius: `${shape.lg}px`, bgcolor: roles.surfaceContainerLow }),
        }}
      >
        {tasks.slice(0, 2).map((task, i) => (
          <Box
            component="li"
            data-need="supply-task"
            key={`${task.code}-${task.order_id ?? task.entry_id}-${i}`}
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
              {task.status === 'problem' ? (
                <TriangleAlert size={20} />
              ) : (
                <ClipboardList size={20} />
              )}
            </Box>
            <Typography
              variant="bodyLarge"
              sx={{ flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {c.task[task.code](task.partner || c.title)}
            </Typography>
            <Button
              variant="text"
              sx={{ minHeight: 48, flexShrink: 0, ml: 'auto' }}
              onClick={() => (task.order_id ? setOrderId(task.order_id) : setOpen(true))}
            >
              {c.action.open}
            </Button>
          </Box>
        ))}
      </Box>
      <OnceOpened open={open} onClose={() => setOpen(false)}>
        <SupplyHub open={open} onClose={() => setOpen(false)} />
      </OnceOpened>
      <OnceOpened open={order !== null} onClose={() => setOrderId(null)}>
        <OrderSheet order={order} open={order !== null} onClose={() => setOrderId(null)} />
      </OnceOpened>
    </>
  )
}

/** Close the day: received but not confirmed, or shipped without a notice? Send in one tap. */
export function CloseDaySupply() {
  const c = useIoCopy()
  const roles = useTheme().material
  const { board } = useBoard(true)
  const actions = useIoActions()
  const sending = useUndoableSend()
  if (!board) return null
  const unsent = board.unsent
  const active = board.orders.some((o) => o.documents.some((d) => d.direction === 'out'))
  if (!unsent.length && !active) return null
  return (
    <Box
      component="section"
      aria-label={c.beforeClose}
      sx={{
        p: 3,
        mb: 3,
        borderRadius: `${shape.md}px`,
        bgcolor: unsent.length ? roles.secondaryContainer : roles.surfaceContainerLow,
        color: unsent.length ? roles.onSecondaryContainer : roles.onSurface,
      }}
    >
      {unsent.length === 0 ? (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} role="status">
          <CircleCheck size={20} aria-hidden="true" />
          <Typography variant="titleSmall">{c.allSent}</Typography>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Typography variant="titleSmall" component="h3">
            {c.beforeClose}: {c.notSent(unsent.length)}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 5 }}>
            {unsent.slice(0, 5).map((row) => (
              <Typography component="li" variant="bodyMedium" key={`${row.order_id}-${row.kind}`}>
                {c.kind[row.kind]} · {row.partner}
              </Typography>
            ))}
          </Box>
          {sending.left !== null ? (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Typography variant="bodyMedium" aria-live="polite">
                {c.sendingIn(sending.left)}
              </Typography>
              <Button variant="contained" onClick={sending.undo} sx={{ minHeight: 48 }}>
                {c.action.undo}
              </Button>
            </Stack>
          ) : (
            <Button
              variant="contained"
              onClick={() => sending.start(() => actions.sendAll())}
              sx={{ alignSelf: 'flex-start', minHeight: 48 }}
            >
              {c.action.sendAll(unsent.length)}
            </Button>
          )}
        </Stack>
      )}
    </Box>
  )
}

export interface SupplyCardData {
  view: View | 'order' | 'sap'
  order: IoOrder | null
  document_id?: string
}

/** A coach chat card: the order it acted on (tap for the detail), or the supply screens. */
export function SupplyChatCard({ data }: { data: SupplyCardData }) {
  const c = useIoCopy()
  const { board } = useBoard(true)
  const [open, setOpen] = useState(data.view === 'sap')
  const latest = (data.order && board?.orders.find((o) => o.id === data.order!.id)) || data.order
  if (latest)
    return (
      <>
        <OrderCard order={latest} onOpen={() => setOpen(true)} />
        <OnceOpened open={open} onClose={() => setOpen(false)}>
          <OrderSheet
            order={latest}
            open={open}
            onClose={() => setOpen(false)}
            sapDocId={data.view === 'sap' ? data.document_id : undefined}
          />
        </OnceOpened>
      </>
    )
  const view: View = data.view === 'order' || data.view === 'sap' ? 'needs' : data.view
  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)} sx={{ minHeight: 48 }}>
        {c.action.open}: {c.tabs[view]}
      </Button>
      <OnceOpened open={open} onClose={() => setOpen(false)}>
        <SupplyHub open={open} onClose={() => setOpen(false)} initial={view} />
      </OnceOpened>
    </>
  )
}
