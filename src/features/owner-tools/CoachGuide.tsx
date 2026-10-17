import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import type { Business, Product } from '../v1/api'
import type { ToolCopy } from './copy'
import { useToolCopy } from './copy'
import { openOwnerFeature } from './entry'
import { useWorkspace } from '../v1/workspaceContext'

/** Shared by the help screen and empty coach. Saved item names stay in the owner's words. */
function guideExamples(t: ToolCopy, shop: Business | null, products: Product[]) {
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
    ['forecast', t.forecastJob, t.forecastPrompt.replace('{item}', item)],
    ['source', t.sourceJob, t.sourcePrompt.replace('{supply}', supply)],
    ['rescue', t.rescueJob, t.rescuePrompt],
    ['answer', t.answerJob, t.answerPrompt],
    ['google', t.googleJob, t.googlePrompt],
  ]
  // Appointments and services are not perishable stock; six relevant examples remain.
  if (services) rows.splice(4, 1)
  return rows.map(([id, job, sentence]) => ({ id: id!, job: job!, sentence: sentence! }))
}

export function GuideChips({
  compact = false,
  disabled = false,
  onSend,
}: {
  compact?: boolean
  disabled?: boolean
  onSend: (sentence: string) => void
}) {
  const t = useToolCopy()
  const ws = useWorkspace()
  const examples = guideExamples(t, ws.active, ws.products)
  return (
    <Stack spacing={2}>
      <Typography component={compact ? 'h2' : 'p'} variant={compact ? 'titleMedium' : 'bodyLarge'}>
        {compact ? t.guideTitle : t.guideIntro}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
        }}
      >
        {(compact ? examples.slice(0, 3) : examples).map(({ id, job, sentence }) => (
          <Stack key={id} spacing={0.5}>
            {!compact && (
              <Typography variant="labelLarge" component="h2">
                {job}
              </Typography>
            )}
            <Chip
              label={sentence}
              variant="outlined"
              disabled={disabled}
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
      {compact && (
        <Button onClick={() => openOwnerFeature('guide')} sx={{ alignSelf: 'flex-start' }}>
          {t.allGuide}
        </Button>
      )}
    </Stack>
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
    </Stack>
  )
}
