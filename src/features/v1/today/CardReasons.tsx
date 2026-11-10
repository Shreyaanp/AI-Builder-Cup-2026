import { Box, Button, Stack, Typography } from '@mui/material'
import { useWorkspace } from '../workspaceContext'
import { dismissCard, type Reason, type TodayCards } from './cardChoices'
import { useCardsMoreCopy } from './cardsMoreCopy'

/**
 * Why a Today card goes (OB-176): "Not now" hides it until tomorrow, "Not useful" rests that
 * kind for two weeks, "Keep it" closes the question. Loaded on the first X tap.
 */
export function CardReasons({
  card,
  cards,
  onClose,
}: {
  card: string
  cards: TodayCards | null | undefined
  onClose: () => void
}) {
  const ws = useWorkspace()
  const c = useCardsMoreCopy()
  const shopId = ws.active?.id
  async function hide(reason: Reason) {
    onClose()
    if (!shopId) return
    const saved = await dismissCard(ws.api, shopId, cards ?? undefined, card, reason)
    ws.notify(saved ? (reason === 'not_now' ? c.hiddenTomorrow : c.hiddenRest) : c.failed)
  }
  return (
    <Box role="group" aria-label={c.why} sx={{ flexBasis: '100%', pl: 9 }}>
      <Typography variant="bodyMedium" color="text.secondary">
        {c.why}
      </Typography>
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button data-uncounted sx={{ minHeight: 48 }} onClick={() => void hide('not_now')}>
          {c.notNow}
        </Button>
        <Button data-uncounted sx={{ minHeight: 48 }} onClick={() => void hide('not_useful')}>
          {c.notUseful}
        </Button>
        <Button data-uncounted sx={{ minHeight: 48 }} onClick={onClose}>
          {c.keep}
        </Button>
      </Stack>
    </Box>
  )
}
