import { useState } from 'react'
import { productName } from '../../../i18n/productNames'
import type { useLocale } from '../../../state/hooks'
import { useCopy } from '../strings'
import { useWorkspace } from '../workspaceContext'
import { promiseCopyFor } from './promiseCopy'
import type { TodayPromise } from './todayPlan'

/** "Done" or "Not today" for last night's promise: either way it leaves Today, with no comment. */
export function usePromiseSettle(
  promise: TodayPromise | null,
  answerPromise: (day: string) => void,
) {
  const t = useCopy()
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const settle = (state: 'done' | 'skipped') => {
    if (!ws.active || !promise) return
    const id = ws.active.id
    setBusy(true)
    void ws
      .api(`/businesses/${encodeURIComponent(id)}/promise/${promise.day}/${state}`, {
        // 204, no body.
        method: 'POST',
        raw: true,
      })
      .then(() => answerPromise(promise.day))
      .catch(() => ws.notify(t.actionFailed))
      .finally(() => setBusy(false))
  }
  return { busy, settle }
}

/** What the owner promised, in words: "Last night you said: order Milk". */
export function promiseSaid(promise: TodayPromise, locale: ReturnType<typeof useLocale>): string {
  const pc = promiseCopyFor(locale)
  const item = promise.item ? productName(promise.item, locale) : null
  return pc.said(
    item && promise.kind === 'order'
      ? pc.orderThing(item)
      : item && promise.kind === 'make'
        ? pc.makeThing(item)
        : promise.text,
  )
}
