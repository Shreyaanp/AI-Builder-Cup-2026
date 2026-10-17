import { useEffect, useState, useSyncExternalStore } from 'react'
import { useIdentity } from '../../../auth/useIdentity'
import { dismissFreshness, readDismissal, subscribeDismissal } from '../../sales/freshnessDismissal'
import { useWorkspace } from '../workspaceContext'
import { todayPlan, type TodayPlan } from './todayPlan'
import { useToday } from './useToday'

/** Today's plan for the active shop, with the daily menu answer remembered for this visit. */
export function useTodayPlan(unread: number | null): {
  plan: TodayPlan | null
  answerMenu: () => void
  markCloseDay: () => void
} {
  const ws = useWorkspace()
  const facts = useToday()
  const { scope } = useIdentity()
  const key = `chalkboard.freshness.${scope}.${ws.active?.id ?? ''}`
  const closedKey = `chalkboard.closeday.${scope}.${ws.active?.id ?? ''}`
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
  // The greeting follows the clock; re-check each minute.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  if (!ws.active || !ws.productsLoaded)
    return { plan: null, answerMenu: () => undefined, markCloseDay: () => undefined }
  const plan = todayPlan({
    shop: ws.active,
    products: ws.products,
    unread,
    facts,
    menuAnswered: Boolean(facts && answered === facts.date),
    dayClosed: Boolean(facts ? closedDay === facts.date : closedDay),
    now,
  })
  return {
    plan,
    answerMenu: () => {
      if (facts) dismissFreshness(key, facts.date)
    },
    markCloseDay: () => {
      dismissFreshness(closedKey, facts?.date ?? new Date().toISOString().slice(0, 10))
    },
  }
}
