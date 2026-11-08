import { Box, Button, Collapse, Stack, Typography } from '@mui/material'
import { ChefHat, PackageSearch, SlidersHorizontal } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { productName } from '../../i18n/productNames'
import { Tile, Supporting } from '../v1/ShopTiles'
import { useCopy } from '../v1/strings'
import { useGrowCopy } from '../v1/growCopy'
import { useWorkspace } from '../v1/workspaceContext'
import { useSourcingCopy } from '../sourcing/copy'
import { Sheet } from '../v1/Sheet'
import { PlanTomorrow } from '../planning/PlanTomorrow'
import { useOrderUnit } from '../supply/supplyData'
import { useForecast, useRunsOut } from './forecastData'
import { LastDayPlan, useLastDayWords } from './lastDay'
import { useOrderChangeCopy } from '../supply/orderChangeCopy'

/**
 * Grow's How much to make row (simplify batch 4b): tomorrow's numbers on the row; the sheet holds
 * the whole list and, under "Change the numbers", what was Plan tomorrow. `sheet` says what is
 * open: the list, or the list with the numbers open (the coach's and the brief's "plan").
 */
export function MakeRow({
  sheet,
  onSheet,
}: {
  sheet: 'list' | 'numbers' | null
  onSheet: (sheet: 'list' | 'numbers' | null) => void
}) {
  const { products, startCoachDraft } = useWorkspace()
  const t = useCopy()
  const grow = useGrowCopy()
  const locale = useLocale()
  const unit = useOrderUnit()
  const { state, value, retry } = useForecast()
  const tomorrow = value?.predictions?.[0]?.date
  const tomorrowRows = value?.predictions?.filter((row) => row.date === tomorrow) ?? []
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  // The row's one line: the first two items, "Masala chai 89 cup, Ginger chai 73 cup".
  const line = (row: (typeof tomorrowRows)[number]) =>
    `${productName(row.item, locale)} ${number.format(row.quantity)} ${unit(row.unit)}`
  const list = new Intl.ListFormat(locale, { style: 'narrow', type: 'unit' })
  // One closed day is already a plan: never "import 4 weeks" after a close (OB-329).
  const closed = value?.last_day ?? null
  const lastDay = useLastDayWords()
  const method =
    value && !closed ? (value.method === 'timesfm' ? t.prepTimesfm : t.prepWeekday) : ''
  return (
    <>
      <Tile
        tour="prep"
        icon={<ChefHat size={20} />}
        label={grow.make}
        value={
          state?.error
            ? t.actionFailed
            : !value
              ? t.prepLoading
              : closed
                ? lastDay.short(closed)
                : value.status === 'insufficient'
                  ? t.prepEmpty
                  : tomorrowRows.length
                    ? list.format(tomorrowRows.slice(0, 2).map(line))
                    : t.prepTomorrow
        }
        onClick={() => (state?.error ? retry() : onSheet('list'))}
      />
      <Sheet
        open={sheet !== null}
        onClose={() => onSheet(null)}
        titleId="make-title"
        ask="forecast"
        title={grow.make}
        actions={
          <Button
            variant="contained"
            sx={{ minHeight: 48 }}
            onClick={() => {
              onSheet(null)
              startCoachDraft(t.prepQuestion)
            }}
          >
            {grow.askCoach}
          </Button>
        }
      >
        {!closed && (
          <Typography variant="titleSmall" color="text.secondary" sx={{ mb: 2 }}>
            {t.prepTomorrow}
          </Typography>
        )}
        {closed ? (
          <LastDayPlan day={closed} />
        ) : tomorrowRows.length > 0 ? (
          <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {tomorrowRows.map((row) => (
              <Stack
                component="li"
                key={row.item}
                direction="row"
                sx={{ gap: 2, justifyContent: 'space-between', alignItems: 'baseline' }}
              >
                <Typography variant="bodyLarge" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {productName(row.item, locale)}
                </Typography>
                <Typography
                  variant="bodyLarge"
                  sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                >
                  {number.format(row.quantity)} {unit(row.unit)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="bodyLarge">
            {state?.error ? t.actionFailed : value ? t.prepEmpty : t.prepLoading}
          </Typography>
        )}
        {method && (
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 3 }}>
            {method}
          </Typography>
        )}
        {/* What was Plan tomorrow: the owner's own numbers per item, on the same sheet. */}
        <Button
          variant="outlined"
          aria-expanded={sheet === 'numbers'}
          startIcon={<SlidersHorizontal size={18} />}
          onClick={() => onSheet(sheet === 'numbers' ? 'list' : 'numbers')}
          sx={{ mt: 4, minHeight: 48 }}
        >
          {grow.changeNumbers}
        </Button>
        <Collapse in={sheet === 'numbers'} unmountOnExit>
          <Box sx={{ pt: 4 }}>
            {products.some((product) => product.id) ? (
              <PlanTomorrow title={grow.changeNumbers} />
            ) : (
              <Typography variant="bodyMedium" color="text.secondary">
                {t.productsEmpty}
              </Typography>
            )}
          </Box>
        </Collapse>
      </Sheet>
    </>
  )
}

/** Buy stock → To do: "Tea dust runs out Thu · Find suppliers", leading what needs buying now. */
export function RunsOutCard({ onAct }: { onAct: () => void }) {
  const s = useSourcingCopy()
  const c = useOrderChangeCopy()
  const runsOut = useRunsOut()
  if (!runsOut || runsOut.arriving) return null
  const { need, more, onOrder } = runsOut
  return (
    <Tile
      alert
      icon={<PackageSearch size={20} />}
      label={runsOut.label}
      value={need?.covered ? onOrder : s.findSuppliers}
      onClick={() => {
        onAct()
        runsOut.act()
      }}
    >
      {/* Partly on order still needs ordering: what is coming shows under Find suppliers. */}
      {need && !need.covered && onOrder && <Supporting>{onOrder}</Supporting>}
      {more > 0 && <Supporting>{c.moreRunOut(more)}</Supporting>}
    </Tile>
  )
}
