import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { Globe, Stamp, Sunrise, Wallet } from 'lucide-react'
import { useIdentity } from '../../../auth/useIdentity'
import { CloseDayTile } from '../../closeday/CloseDay'
import { MySalesRow } from '../../sales/MySales'
import { openOwnerFeature } from '../../owner-tools/entry'
import { useToolCopy } from '../../owner-tools/copy'
import {
  GROW_ORDER_WAIT_MS,
  growOrderOf,
  rememberedGrowOrder,
  rememberGrowOrder,
} from '../playbook/growOrder'
import { usePlaybook } from '../playbook/usePlaybook'
import { readiness } from '../shopProgress'
import { ShopSheets, Tile, type ShopSheetKind } from '../ShopTiles'
import { GrowGroup, GrowRows, MoreTools } from '../GrowList'
import { useGrowCopy } from '../growCopy'
import { useCopy } from '../strings'
import { useTabsCopy } from '../tabsCopy'
import { useWorkspace } from '../workspaceContext'
import { ShopGate } from './ShopScreen'
import { AskHint } from '../AskHint'
import { clearOpen, wantsOpen } from '../openRequest'
import { MorningBrief } from '../../owner/MorningBrief'
import { useOwnerCopy } from '../../owner/copy'
import { RadarSheet, RadarTile } from '../../owner/RadarTile'
import { RescueTile } from '../../owner/RescueTile'

/**
 * Grow: a short list of rows, then the weekly tools as a More tools grid (simplify batch 4a).
 * How much to make and My sales each open one sheet that holds what were separate
 * tools (batch 4b), every one still under a visible name. The shop playbook decides which row
 * leads.
 */
// How much to make pulls in the forecast; load it after first paint.
const MakeRow = lazy(() => import('../../forecast/PrepPlan').then((m) => ({ default: m.MakeRow })))

export function GrowScreen() {
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  return (
    <ShopGate>
      <Box component="section" aria-label={tabs.navGrow} sx={{ maxWidth: 720, mx: 'auto', pt: 2 }}>
        <Typography component="h1" sx={visuallyHidden}>
          {tabs.growTitle}
        </Typography>
        <GrowTiles key={ws.activeId} />
      </Box>
    </ShopGate>
  )
}

/** Rows the playbook suggests first, the rest in their usual order (stable). A row ranks by
 * its best-placed tool; tools without a playbook id of their own count as the closest one. */
const GROW_ALIAS: Record<string, string> = {
  supply: 'orders',
  supply_io: 'orders',
  week: 'recap',
}
function byGrowOrder(grow: string[], rows: [string[], ReactNode][]): ReactNode[] {
  const rank = (ids: string[]) =>
    Math.min(
      ...ids.map((id) => {
        const index = grow.indexOf(GROW_ALIAS[id] ?? id)
        return index < 0 ? grow.length : index
      }),
    )
  return rows
    .map(([ids, node], index) => ({ node, index, rank: rank(ids) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.node)
}

function GrowTiles() {
  const t = useCopy()
  const tabs = useTabsCopy()
  const tools = useToolCopy()
  const grow = useGrowCopy()
  const owner = useOwnerCopy()
  const { features } = useIdentity()
  const ws = useWorkspace()
  const { state: playbook } = usePlaybook()
  // One row order per visit (see rememberedGrowOrder): the shop's last known order, else the
  // playbook's if it answers within a second, else the usual order. Undecided rows stay hidden.
  const [order, setOrder] = useState(() => rememberedGrowOrder(ws.activeId) ?? null)
  if (order === null && playbook.kind !== 'loading') setOrder(growOrderOf(playbook))
  useEffect(() => rememberGrowOrder(ws.activeId, playbook), [ws.activeId, playbook])
  useEffect(() => {
    if (order) return
    const timer = window.setTimeout(() => setOrder((known) => known ?? []), GROW_ORDER_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [order])
  const [sheet, setSheet] = useState<ShopSheetKind | null>(null)
  // The coach's "open" for a Grow screen opens it here: Asked nearby, How much to make with the
  // numbers open ("plan tomorrow").
  const [radarOpen, setRadarOpen] = useState(() => wantsOpen('radar'))
  const [make, setMake] = useState<'list' | 'numbers' | null>(() =>
    wantsOpen('plan') ? 'numbers' : wantsOpen('make') ? 'list' : null,
  )
  const [sales, setSales] = useState(false)
  useEffect(() => {
    clearOpen('radar')
    clearOpen('plan')
    clearOpen('make')
  }, [])
  const shop = ws.active
  if (!shop) return null
  const { done, total } = readiness(ws)
  const missing = total - done
  // Evenings lead with closing the day; the rest of the day with what to prepare.
  const evening = new Date().getHours() >= 17
  const makeRow: [string[], ReactNode] = [
    ['prep', 'plan'],
    <Suspense key="make" fallback={null}>
      <MakeRow sheet={make} onSheet={setMake} />
    </Suspense>,
  ]
  const close: [string[], ReactNode] = [['close_day'], <CloseDayTile key="close" />]
  // The shop's playbook decides which row comes first; without one, the usual order.
  const rows = byGrowOrder(order ?? [], [
    ...(evening ? [close, makeRow] : [makeRow, close]),
    [['week', 'recap'], <MySalesRow key="sales" open={sales} onOpen={setSales} />],
    ...(features.google_guide
      ? [
          [
            ['google'],
            <Tile
              key="google"
              tour="google"
              icon={<Globe size={20} />}
              label={t.googleTitle}
              value={missing > 0 ? tabs.googleMissing(missing) : tabs.googleReady}
              onClick={() => ws.go('google')}
            />,
          ] as [string[], ReactNode],
        ]
      : []),
  ])
  return (
    <Stack spacing={6}>
      <Box
        aria-busy={order ? undefined : true}
        sx={order ? undefined : { visibility: 'hidden' }}
        data-testid="grow-rows"
      >
        <GrowRows>
          {/* The brief keeps its own row: Coach Today shows only part of it (one forecast, the
            rain line, low stock), not the whole prep list, the weather or the best action. */}
          <GrowGroup
            icon={<Sunrise size={20} />}
            label={owner.brief}
            hint={[owner.prep, owner.lowStock].join(' · ')}
            items={[
              <MorningBrief
                key={shop.id}
                embedded
                onSheet={setSheet}
                onRadar={() => setRadarOpen(true)}
                onPlan={() => setMake('numbers')}
              />,
            ]}
          />
          {rows}
        </GrowRows>
      </Box>
      <MoreTools title={grow.moreTools}>
        <RescueTile />
        <RadarTile />
        <Tile
          icon={<Wallet size={20} />}
          label={tools.payTitle}
          value={tools.create}
          onClick={() => openOwnerFeature('payments')}
        />
        <Tile
          icon={<Stamp size={20} />}
          label={tabs.perks}
          value={shop.fields.reward_text || tabs.perksOff}
          onClick={() => ws.openEditor({ kind: 'business', fields: shop.fields, step: 'reward' })}
        />
      </MoreTools>
      <AskHint id="forecast" />
      <ShopSheets kind={sheet} onClose={() => setSheet(null)} />
      <RadarSheet open={radarOpen} onClose={() => setRadarOpen(false)} />
    </Stack>
  )
}
