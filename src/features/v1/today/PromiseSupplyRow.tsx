import { Button } from '@mui/material'
import { useLocale } from '../../../state/hooks'
import { useWorkspace } from '../workspaceContext'
import { TodaySupply } from '../../supply/TodaySupply'
import { promiseCopyFor } from './promiseCopy'
import { promiseSaid, usePromiseSettle } from './promiseSettle'
import type { TodayPromise } from './todayPlan'
import { countAction } from './habitCount'

/**
 * Last night's promise names the supply row's item: one row says both, with the run-out day,
 * the on-order line and "N more", and its Reorder is the supply row's own (the purchase order).
 */
export function PromiseSupplyRow({
  promise,
  first,
  answerPromise,
}: {
  promise: TodayPromise
  first: boolean
  answerPromise: (day: string) => void
}) {
  const ws = useWorkspace()
  const locale = useLocale()
  const pc = promiseCopyFor(locale)
  const { busy, settle } = usePromiseSettle(promise, answerPromise)
  return (
    <TodaySupply
      first={first}
      onAct={() => countAction(ws, 'promise')}
      promise={{
        said: promiseSaid(promise, locale),
        busy,
        onReorder: () => settle('done'),
        // Clearing it is not a useful action: never action_done, never the first action.
        extra: (
          <Button
            disabled={busy}
            data-uncounted
            sx={{ minHeight: 48 }}
            onClick={() => settle('skipped')}
          >
            {pc.notToday}
          </Button>
        ),
      }}
    />
  )
}
