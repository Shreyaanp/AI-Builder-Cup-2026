import { useEffect, useState, useSyncExternalStore } from 'react'
import { useIdentity } from '../../../auth/useIdentity'
import { dismissFreshness, readDismissal, subscribeDismissal } from '../../sales/freshnessDismissal'
import { useTrust } from '../../trust/useTrust'
import { useTodaySupplyLead } from '../../supply/supplyData'
import { useWorkspace } from '../workspaceContext'
import { todayPlan, type TodayPlan } from './todayPlan'
import { useToday } from './useToday'

/** Runs out within 2 days of the shop's today (both ISO dates); false when either is unknown. */
function soon(runsOut: string | undefined, today: string | undefined): boolean {
  if (!runsOut || !today) return false
  const days = (Date.parse(runsOut.slice(0, 10)) - Date.parse(today)) / 86_400_000
  return days <= 2
}

/** Today's plan for the active shop, with the daily menu answer remembered for this visit. */
export function useTodayPlan(unread: number | null): {
  plan: TodayPlan | null
  answerMenu: () => void
  markCloseDay: () => void
  /** This morning's promise was done or cleared: it leaves Today now, not on the next reload. */
  answerPromise: (day: string) => void
  firstCustomers: boolean
} {
  const ws = useWorkspace()
  const facts = useToday()
  const { trust } = useTrust(ws.api)
  const identity = useIdentity()
  const { scope } = identity
  const key = `chalkboard.freshness.${scope}.${ws.active?.id ?? ''}`
  const closedKey = `chalkboard.closeday.${scope}.${ws.active?.id ?? ''}`
  const promiseKey = `chalkboard.promise.${scope}.${ws.active?.id ?? ''}`
  const supply = useTodaySupplyLead()
  const answered = useSyncExternalStore(
    subscribeDismissal,
    () => readDismissal(key),
    () => null,
  )
  const closedDay = useSyncExternalStore(
    subscribeDismissal,
    () => readDismissal(closedKey),
    () => null,
  )
  const promiseDay = useSyncExternalStore(
    subscribeDismissal,
    () => readDismissal(promiseKey),
    () => null,
  )
  // The greeting follows the clock; re-check each minute.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  if (!ws.active || !ws.productsLoaded)
    return {
      plan: null,
      answerMenu: () => undefined,
      markCloseDay: () => undefined,
      answerPromise: () => undefined,
      firstCustomers: false,
    }
  const plan = todayPlan({
    shop: ws.active,
    products: ws.products,
    unread,
    facts,
    menuAnswered: Boolean(facts && answered === facts.date),
    dayClosed: Boolean(facts ? closedDay === facts.date : closedDay),
    now,
    face: identity.features.face_check ? (trust?.face ?? null) : null,
    orderable: supply.toOrder.filter((ask) => ask.sold_out).map((ask) => ask.item),
    supply: supply.item
      ? {
          item: supply.item,
          soon: soon(supply.need?.runs_out, facts?.date),
          waiting: supply.waiting,
        }
      : null,
    promiseAnswered: Boolean(facts?.promise && promiseDay === facts.promise.day),
  })
  return {
    plan,
    firstCustomers: ws.active.public && facts?.has_customer_stamp === false,
    answerMenu: () => {
      if (facts) dismissFreshness(key, facts.date)
    },
    answerPromise: (day) => dismissFreshness(promiseKey, day),
    markCloseDay: () => {
      dismissFreshness(closedKey, facts?.date ?? new Date().toISOString().slice(0, 10))
    },
  }
}
