import { useState } from 'react'
import { Box, LinearProgress, Stack, Typography, useTheme } from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { CalendarClock, Globe, IndianRupee, Stamp } from 'lucide-react'
import { CloseDayTile } from '../../closeday/CloseDay'
import { openOwnerFeature } from '../../owner-tools/entry'
import { useToolCopy } from '../../owner-tools/copy'
import { PrepPlanTile } from '../../forecast/PrepPlan'
import { useCopy as usePlanCopy } from '../../planning/strings'
import { RecapTile } from '../../sales/ShopInsights'
import { OrdersTile } from '../../sourcing/Orders'
import { SupplyTile } from '../../supply/Supply'
import { readiness } from '../shopProgress'
import { ShopSheets, Supporting, Tile, type ShopSheetKind } from '../ShopTiles'
import { tileGrid } from '../tileSpan'
import { useCopy } from '../strings'
import { useTabsCopy } from '../tabsCopy'
import { useWorkspace } from '../workspaceContext'
import { ShopGate } from './ShopScreen'
import { MorningBrief } from '../../owner/MorningBrief'
import { RadarSheet, RadarTile } from '../../owner/RadarTile'
import { RescueTile } from '../../owner/RescueTile'

/**
 * Grow: every owner tool as a card with its live one-line status. Cards open the existing
 * screens and flows. Tools that do not exist yet (payments, POS) have no card at all.
 */
export function GrowScreen() {
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  return (
    <ShopGate>
      <Box component="section" aria-label={tabs.navGrow} sx={{ maxWidth: 760, mx: 'auto', pt: 2 }}>
        <Typography component="h1" sx={visuallyHidden}>
          {tabs.growTitle}
        </Typography>
        <GrowTiles key={ws.activeId} />
      </Box>
    </ShopGate>
  )
}

function GrowTiles() {
  const t = useCopy()
  const tabs = useTabsCopy()
  const plan = usePlanCopy()
  const tools = useToolCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [planOpen, setPlanOpen] = useState(false)
  const [sheet, setSheet] = useState<ShopSheetKind | null>(null)
  const [radarOpen, setRadarOpen] = useState(false)
  const shop = ws.active
  if (!shop) return null
  const { done, total } = readiness(ws)
  const missing = total - done
  const stamps = shop.fields.stamps_needed ?? 8
  // Evenings lead with closing the day; the rest of the day with what to prepare.
  const evening = new Date().getHours() >= 17
  const prep = <PrepPlanTile key="prep" />
  const close = <CloseDayTile key="close" />
  return (
    <Stack spacing={4}>
      <MorningBrief key={shop.id} onSheet={setSheet} onRadar={() => setRadarOpen(true)} />
      <Box data-testid="grow-tiles" sx={tileGrid}>
        {evening ? [close, prep] : [prep, close]}
        <OrdersTile />
        <SupplyTile />
        <Tile
          icon={<CalendarClock size={20} />}
          label={plan.title}
          value={t.planHint}
          onClick={() => setPlanOpen(true)}
        />
        <RescueTile />
        <RadarTile />
        <Tile
          icon={<IndianRupee size={20} />}
          label={tools.payTitle}
          value={tools.create}
          onClick={() => openOwnerFeature('payments')}
        >
          <Supporting>{tools.riderTitle}</Supporting>
        </Tile>
        <Tile
          span={2}
          tour="google"
          icon={<Globe size={20} />}
          label={t.googleTitle}
          value={missing > 0 ? tabs.googleMissing(missing) : tabs.googleReady}
          onClick={() => ws.go('google')}
        >
          {missing > 0 && (
            <LinearProgress
              variant="determinate"
              value={(done / total) * 100}
              aria-hidden="true"
              sx={{ height: 4, borderRadius: 2, bgcolor: roles.surfaceContainerHighest }}
            />
          )}
        </Tile>
        <Tile
          icon={<Stamp size={20} />}
          label={tabs.perks}
          value={shop.fields.reward_text || tabs.perksOff}
          onClick={() => ws.openEditor({ kind: 'business', fields: shop.fields })}
        >
          {shop.fields.reward_text && <Supporting>{tabs.perksAfter(stamps)}</Supporting>}
        </Tile>
        <RecapTile />
      </Box>
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
