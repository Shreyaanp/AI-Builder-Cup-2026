import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { ChevronRight, Truck } from 'lucide-react'
import type { Business, Product } from '../v1/api'
import type { ToolCopy } from './copy'
import { useToolCopy } from './copy'
import { openOwnerFeature } from './entry'
import { useGrowCopy } from '../v1/growCopy'
import { requestOpen } from '../v1/openRequest'
import { useWorkspace } from '../v1/workspaceContext'
import { SeeAgain } from '../first-run/FirstRun'
import { useSimpleCopy } from '../v1/today/simpleCopy'
import { useTodayCopy } from '../v1/today/todayCopy'
import { useToday } from '../v1/today/useToday'
import { useLocale } from '../../state/hooks'
import { productName } from '../../i18n/productNames'

/** Shared by the help screen and empty coach. Saved item names stay in the owner's words. */
function guideExamples(t: ToolCopy, shop: Business | null, products: Product[], locale: string) {
  const category = shop?.fields.category ?? ''
  const services = /salon|barber|tailor|repair|tuition|service|beauty|laundry|clinic|spa/i.test(
    category,
  )
  const items = services ? t.services : t.items
  const item = products[0]?.name || items
  const supply = products.at(-1)?.name || t.supplies
  const rows = [
    ['menu', t.menuJob, t.menuPrompt.replace('{items}', items)],
    ['close', t.closeJob, t.closePrompt],
    ['forecast', t.forecastJob, t.forecastPrompt.replace('{item}', productName(item, locale))],
    ['source', t.sourceJob, t.sourcePrompt.replace('{supply}', supply)],
    ['rescue', t.rescueJob, t.rescuePrompt],
    ['answer', t.answerJob, t.answerPrompt],
    ['google', t.googleJob, t.googlePrompt],
  ]
  // Appointments and services are not perishable stock; six relevant examples remain.
  if (services) rows.splice(4, 1)
  return rows.map(([id, job, sentence]) => ({ id: id!, job: job!, sentence: sentence! }))
}

export function GuideChips({ onSend }: { onSend: (sentence: string) => void }) {
  const t = useToolCopy()
  const locale = useLocale()
  const ws = useWorkspace()
  const facts = useToday()
  const closed = facts?.today && (facts.today.sales != null || facts.today.items != null)
  const examples = guideExamples(t, ws.active, ws.products, locale).filter(
    (example) => example.id !== 'close' || (!closed && (!ws.active || facts !== null)),
  )
  return (
    <Stack spacing={2}>
      <Typography component="p" variant="bodyLarge">
        {t.guideIntro}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {examples.map(({ id, job, sentence }) => (
          <Stack key={id} spacing={0.5}>
            <Typography variant="labelLarge" component="h2">
              {job}
            </Typography>
            <Chip
              label={sentence}
              variant="outlined"
              onClick={() => onSend(sentence)}
              sx={{
                height: 'auto',
                minHeight: 48,
                justifyContent: 'flex-start',
                maxWidth: '100%',
                '& .MuiChip-label': { whiteSpace: 'normal', py: 1, overflowWrap: 'anywhere' },
              }}
            />
          </Stack>
        ))}
      </Box>
    </Stack>
  )
}

/**
 * Coach Today's two short chips that fit the hour, each sending a full sentence, and "What can I
 * ask?" for every example (SIMPLIFY §3.6). The chat path to the screen's own tools.
 */
export function TodayChips({
  evening,
  disabled = false,
  onSend,
}: {
  evening: boolean
  disabled?: boolean
  onSend: (sentence: string) => void
}) {
  const t = useToolCopy()
  const s = useSimpleCopy()
  const tt = useTodayCopy()
  const grow = useGrowCopy()
  const locale = useLocale()
  const ws = useWorkspace()
  const examples = guideExamples(t, ws.active, ws.products, locale)
  const said = (id: string) => examples.find((example) => example.id === id)?.sentence ?? ''
  const make = { label: s.chipMake, sentence: said('forecast') }
  const menu = { label: s.chipMenu, sentence: said('menu') }
  // Evenings ask how the day went; the rest of the day, the menu. Close the day is the card's.
  const chips = evening ? [{ label: tt.howToday, sentence: tt.howToday }, make] : [make, menu]
  return (
    <Box component="section" aria-label={t.guideTitle} data-testid="today-chips">
      <Stack
        direction="row"
        sx={{ columnGap: 2, rowGap: 0, flexWrap: 'wrap', alignItems: 'center' }}
      >
        {chips.map(({ label, sentence }) => (
          <Chip
            key={label}
            label={label}
            variant="outlined"
            disabled={disabled}
            onClick={() => onSend(sentence)}
            sx={{
              height: 'auto',
              minHeight: 48,
              maxWidth: '100%',
              '& .MuiChip-label': { whiteSpace: 'normal', py: 1, overflowWrap: 'anywhere' },
            }}
          />
        ))}
        <Button
          onClick={() => openOwnerFeature('guide')}
          endIcon={<ChevronRight size={18} aria-hidden="true" />}
          sx={{ minHeight: 48, px: 1 }}
        >
          {s.whatCanIAsk}
        </Button>
        {/* Buy stock from Home, on this row so Today stays one screenful (OB-339). */}
        <Button
          startIcon={<Truck size={18} aria-hidden="true" />}
          onClick={() => {
            requestOpen('stock')
            ws.go('shop')
          }}
          sx={{ minHeight: 48, px: 1 }}
        >
          {grow.stock}
        </Button>
      </Stack>
    </Box>
  )
}

export function CoachGuide() {
  const t = useToolCopy()
  const ws = useWorkspace()
  return (
    <Stack spacing={3} sx={{ maxWidth: 880, mx: 'auto', py: 3 }}>
      <Button onClick={() => openOwnerFeature(null)} sx={{ alignSelf: 'flex-start' }}>
        {t.back}
      </Button>
      <Typography component="h1" variant="headlineMedium">
        {t.guideTitle}
      </Typography>
      {ws.active && (
        <Typography variant="bodyLarge">
          {ws.active.fields.name} · {ws.active.fields.category}
        </Typography>
      )}
      <GuideChips
        onSend={(sentence) => {
          openOwnerFeature(null)
          ws.startCoachDraft(sentence, { send: true })
        }}
      />
      {/* You → Help is the tour and this page; the short intro replays from here. */}
      <Box sx={{ alignSelf: 'flex-start' }}>
        <SeeAgain app="owner" />
      </Box>
    </Stack>
  )
}
