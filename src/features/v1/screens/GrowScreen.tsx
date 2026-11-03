import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import {
  BarChart3,
  CalendarClock,
  ChefHat,
  Globe,
  Stamp,
  Sunrise,
  Truck,
  Wallet,
} from 'lucide-react'
import { useIdentity } from '../../../auth/useIdentity'
import { CloseDayTile } from '../../closeday/CloseDay'
import { openOwnerFeature } from '../../owner-tools/entry'
import { useToolCopy } from '../../owner-tools/copy'
import { useCopy as usePlanCopy } from '../../planning/strings'
import { RecapTile } from '../../sales/ShopInsights'
import { OrdersTile } from '../../sourcing/Orders'
import { SupplyHubTile } from '../../supply/SupplyHub'
import { WeekPulseTile } from '../../analytics/WeekPulse'
import { growOrderOf } from '../playbook/growOrder'
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
 * Rows that hold more than one tool open on the same screen to each tool under its own name;
 * every tool keeps its own screen. The shop playbook decides which row leads.
 */
// The prep plan and supply tiles pull in the forecast chart and purchase orders; load them after first paint.
const PrepPlanTile = lazy(() =>
  import('../../forecast/PrepPlan').then((m) => ({ default: m.PrepPlanTile })),
)
const SupplyTile = lazy(() =>
  import('../../supply/Supply').then((m) => ({ default: m.SupplyTile })),
)

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
  const plan = usePlanCopy()
  const tools = useToolCopy()
  const grow = useGrowCopy()
  const owner = useOwnerCopy()
  const { features } = useIdentity()
  const ws = useWorkspace()
  const { state: playbook } = usePlaybook()
  const [planOpen, setPlanOpen] = useState(false)
  const [sheet, setSheet] = useState<ShopSheetKind | null>(null)
  // The coach's "what are people nearby asking for?" opens Asked nearby here.
  const [radarOpen, setRadarOpen] = useState(() => wantsOpen('radar'))
  useEffect(() => clearOpen('radar'), [])
  const shop = ws.active
  if (!shop) return null
  const { done, total } = readiness(ws)
  const missing = total - done
  // Evenings lead with closing the day; the rest of the day with what to prepare.
  const evening = new Date().getHours() >= 17
  const make: [string[], ReactNode] = [
    ['prep', 'plan'],
    <GrowGroup
      key="make"
      tour="make"
      icon={<ChefHat size={20} />}
      label={grow.make}
      items={[
        <Suspense key="prep" fallback={null}>
          <PrepPlanTile show="plan" />
        </Suspense>,
        <Tile
          key="plan"
          icon={<CalendarClock size={20} />}
          label={plan.title}
          value={t.planHint}
          onClick={() => setPlanOpen(true)}
        />,
      ]}
    />,
  ]
  const close: [string[], ReactNode] = [['close_day'], <CloseDayTile key="close" />]
  // The shop's playbook decides which row comes first; without one, the usual order.
  const rows = byGrowOrder(growOrderOf(playbook), [
    ...(evening ? [close, make] : [make, close]),
    [
      ['orders', 'supply', 'supply_io'],
      <GrowGroup
        key="stock"
        icon={<Truck size={20} />}
        label={grow.stock}
        items={[
          // "Tea dust runs out Thu · Find suppliers" leads: it is what needs buying now.
          <Suspense key="runs-out" fallback={null}>
            <PrepPlanTile show="runsOut" />
          </Suspense>,
          <OrdersTile key="orders" />,
          <Suspense key="supply" fallback={null}>
            <SupplyTile />
          </Suspense>,
          <SupplyHubTile key="supply_io" />,
        ]}
      />,
    ],
    [
      ['week', 'recap'],
      <GrowGroup
        key="sales"
        icon={<BarChart3 size={20} />}
        label={grow.sales}
        items={[<WeekPulseTile key="week" />, <RecapTile key="recap" />]}
      />,
    ],
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
            />,
          ]}
        />
        {rows}
      </GrowRows>
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
      <ShopSheets
        kind={sheet ?? (planOpen ? 'plan' : null)}
        onClose={() => {
          setSheet(null)
          setPlanOpen(false)
        }}
      />
      <RadarSheet open={radarOpen} onClose={() => setRadarOpen(false)} />
    </Stack>
  )
}
