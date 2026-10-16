import { useEffect, useState, useSyncExternalStore } from 'react'
import { useIdentity } from '../../../auth/useIdentity'
import { dismissFreshness, readDismissal, subscribeDismissal } from '../../sales/freshnessDismissal'
import { useTrust } from '../../trust/useTrust'
import { useWorkspace } from '../workspaceContext'
import { todayPlan, type TodayPlan } from './todayPlan'
import { useToday } from './useToday'

/** Today's plan for the active shop, with the daily menu answer remembered for this visit. */
export function useTodayPlan(unread: number | null): {
  plan: TodayPlan | null
  answerMenu: () => void
} {
  const ws = useWorkspace()
  const facts = useToday()
  const { trust } = useTrust(ws.api)
  const { scope } = useIdentity()
  const key = `chalkboard.freshness.${scope}.${ws.active?.id ?? ''}`
  const answered = useSyncExternalStore(
    subscribeDismissal,
    () => readDismissal(key),
    () => null,
  )
  // The greeting follows the clock; re-check each minute.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  if (!ws.active) return { plan: null, answerMenu: () => undefined }
  const plan = todayPlan({
    shop: ws.active,
    products: ws.products,
    unread,
    facts,
    menuAnswered: Boolean(facts && answered === facts.date),
    now,
    face: trust?.face ?? null,
  })
  return {
    plan,
    answerMenu: () => {
      if (facts) dismissFreshness(key, facts.date)
    },
  }
}
