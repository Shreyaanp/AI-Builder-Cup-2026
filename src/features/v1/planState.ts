import type { Order } from '../sourcing/types'
import type { PurchaseOrder } from '../supply/types'

/**
 * A request with several steps (OB-174): the steps in the owner's words, how many are done, and
 * the card the plan waits for. The server keeps the plan in the conversation; this is its copy
 * for the steps list and for knowing when the owner's tap should carry it on.
 */
export interface PlanState {
  steps: string[]
  done: number
  waiting?: { kind: 'order' | 'purchase_order' | 'proposal' | 'reply'; id: string; tap: string }
  stopped?: boolean
}

const KINDS = new Set(['order', 'purchase_order', 'proposal', 'reply'])

export function asPlan(data: unknown): PlanState | null {
  if (!data || typeof data !== 'object') return null
  const value = data as Record<string, unknown>
  if (!Array.isArray(value.steps) || typeof value.done !== 'number') return null
  const steps = value.steps.filter((step): step is string => typeof step === 'string')
  const waiting = value.waiting as Record<string, unknown> | undefined
  const card =
    waiting &&
    typeof waiting.id === 'string' &&
    typeof waiting.tap === 'string' &&
    KINDS.has(String(waiting.kind))
      ? {
          kind: waiting.kind as NonNullable<PlanState['waiting']>['kind'],
          id: waiting.id,
          tap: waiting.tap,
        }
      : undefined
  return {
    steps,
    done: value.done,
    ...(card && { waiting: card }),
    ...(value.stopped === true && { stopped: true }),
  }
}

/** The plan has nothing left to do (all ticked, or stopped). */
export function planOver(plan: PlanState | null): boolean {
  return !plan || plan.stopped === true || plan.done >= plan.steps.length
}

/**
 * The card id whose tap (or discard) should carry the plan on now, or null. The same order or
 * purchase order changed anywhere in the app counts: the chat holds its latest state.
 */
export function tappedCard(
  plan: PlanState | null,
  orders: Record<string, Order>,
  pos: Record<string, PurchaseOrder>,
  savedProposals: string[],
  replied: string[],
): string | null {
  const waiting = plan?.waiting
  if (!waiting || plan?.stopped) return null
  if (waiting.kind === 'order') {
    const order = orders[waiting.id]
    if (!order) return null
    const settled = order.status !== 'draft' && !order.pending
    return settled ? waiting.id : null
  }
  if (waiting.kind === 'purchase_order') {
    const po = pos[waiting.id]
    return po && po.status !== 'draft' ? waiting.id : null
  }
  if (waiting.kind === 'proposal') return savedProposals.includes(waiting.id) ? waiting.id : null
  return replied.includes(waiting.id) ? waiting.id : null
}
