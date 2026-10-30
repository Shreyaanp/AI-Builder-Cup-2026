import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Button, IconButton, Stack, Typography, useTheme } from '@mui/material'
import { CircleHelp, MessageSquare, PackageCheck, X } from 'lucide-react'
import { busyWindow, missingFacts } from './shopProgress'
import type { AskFact } from './shopProgress'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { enterRise, shape } from '../../design/theme'

/** How many menu items one sweep asks about (menu order) before it rests until the next window. */
const SWEEP_ITEMS = 3

interface Memory {
  /** Card ids dismissed today. */
  dismissed: string[]
  /** Items confirmed "still have" per busy window today. */
  confirmed: Record<string, string[]>
}

// Remembered per shop and day in this browser only; never sent anywhere.
function memoryKey(shopId: string, day: string) {
  return `chalkboard.cards.${shopId}.${day}`
}
function readMemory(key: string): Memory {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '') as Partial<Memory>
    return { dismissed: value.dismissed ?? [], confirmed: value.confirmed ?? {} }
  } catch {
    return { dismissed: [], confirmed: {} }
  }
}

/**
 * The single most important pending item for a registered shop, rules only (no AI):
 * waiting customers, then the busy-hours sold-out sweep, then facts customers ask about.
 */
export function PendingCard({
  unread,
  onMessages,
  onAnswer,
  compact = false,
}: {
  unread: number | null
  onMessages: () => void
  onAnswer: (fact: AskFact) => void
  compact?: boolean
}) {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  // The clock only decides which card shows; re-check each minute.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const shop = ws.active
  const day = now.toLocaleDateString('en-CA')
  const key = shop ? memoryKey(shop.id, day) : ''
  const [memory, setMemory] = useState<{ key: string; value: Memory }>(() => ({
    key,
    value: readMemory(key),
  }))
  // A new shop or a new day starts from its own memory.
  const current = memory.key === key ? memory.value : readMemory(key)
  if (memory.key !== key) setMemory({ key, value: current })
  function remember(next: Memory) {
    setMemory({ key, value: next })
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Private mode or storage full: the card still hides for this visit.
    }
  }
  const dismiss = (id: string) => remember({ ...current, dismissed: [...current.dismissed, id] })

  if (!shop) return null
  const window = busyWindow(shop.fields.busy_hours, now)
  const sweepItem = window
    ? ws.products
        .slice(0, SWEEP_ITEMS)
        .find(
          (product) =>
            product.available !== false &&
            !(current.confirmed[window] ?? []).includes(product.name),
        )
    : undefined
  const missing = missingFacts(shop.fields)
  const firstMissing = missing[0]

  let card: {
    id: string
    icon: ReactNode
    title: string
    hint?: string
    actions: ReactNode
  } | null = null
  if (unread && !current.dismissed.includes(`messages-${unread}`))
    card = {
      id: `messages-${unread}`,
      icon: <MessageSquare size={20} />,
      title: t.waitingCustomers(unread),
      actions: (
        <Button variant="contained" onClick={onMessages}>
          {t.replyNow}
        </Button>
      ),
    }
  else if (window && sweepItem && !current.dismissed.includes(`sweep-${window}`))
    card = {
      id: `sweep-${window}-${sweepItem.name}`,
      icon: <PackageCheck size={20} />,
      title: t.sweepQuestion(sweepItem.name),
      hint: t.sweepHint,
      actions: (
        <>
          <Button
            variant="contained"
            onClick={() =>
              remember({
                ...current,
                confirmed: {
                  ...current.confirmed,
                  [window]: [...(current.confirmed[window] ?? []), sweepItem.name],
                },
              })
            }
          >
            {t.sweepYes}
          </Button>
          <Button variant="outlined" onClick={() => void ws.setAvailability(sweepItem, false)}>
            {t.soldOut}
          </Button>
        </>
      ),
    }
  else if (firstMissing && !current.dismissed.includes('facts'))
    card = {
      id: 'facts',
      icon: <CircleHelp size={20} />,
      title: t.customersAsk(
        missing
          .slice(0, 2)
          .map((fact) => t.askNames[fact])
          .join(' '),
      ),
      hint: t.customersAskHint,
      actions: (
        <Button variant="contained" onClick={() => onAnswer(firstMissing)}>
          {t.answerNow}
        </Button>
      ),
    }
  if (!card) return null
  const titleId = `pending-${card.id}`.replace(/[^\w-]/g, '_')
  return (
    <Box
      key={card.id}
      component="section"
      aria-labelledby={titleId}
      sx={{
        bgcolor: roles.surfaceContainerHigh,
        borderRadius: `${shape.lgIncreased}px`,
        p: compact ? 2 : 4,
        ...enterRise,
      }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: compact ? 'center' : 'flex-start', gap: compact ? 2 : 3 }}
      >
        <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary, pt: 1 }}>
          {card.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, pt: 1 }}>
          <Typography id={titleId} component="h2" variant={compact ? 'bodyMedium' : 'titleMedium'}>
            {card.title}
          </Typography>
          {card.hint && !compact && (
            <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
              {card.hint}
            </Typography>
          )}
        </Box>
        {compact && (
          <Stack direction="row" sx={{ gap: 1, flexShrink: 0 }}>
            {card.actions}
          </Stack>
        )}
        <IconButton
          aria-label={t.dismiss}
          onClick={() =>
            dismiss(card.id.startsWith('sweep-') && window ? `sweep-${window}` : card.id)
          }
          sx={{ mt: compact ? 0 : -2, mr: compact ? 0 : -2, flexShrink: compact ? 0 : undefined }}
        >
          <X size={20} />
        </IconButton>
      </Stack>
      {!compact && (
        <Stack direction="row" sx={{ mt: 3, gap: 2, flexWrap: 'wrap', pl: 8 }}>
          {card.actions}
        </Stack>
      )}
    </Box>
  )
}
