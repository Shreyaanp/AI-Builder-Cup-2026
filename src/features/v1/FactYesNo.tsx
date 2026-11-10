import { useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import type { Business, Proposal } from './api'
import { missingFacts } from './shopProgress'
import { isYesNoFact } from './factAnswers'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'

/**
 * The next thing customers ask ("halal?", "pre-orders?"), answered with one tap and no chat: the
 * same shop change the coach prepares, reviewed before it is saved (owner, 9 Nov: "features
 * should all work without the chat flow too").
 */
export function FactYesNo({ shop, onReview }: { shop: Business; onReview: () => void }) {
  const t = useCopy()
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const next = missingFacts(shop.fields)[0]
  if (!next || !isYesNoFact(next)) return null
  const fact = next
  async function answer(yes: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const value = fact === 'halal' ? (yes ? 'yes' : 'no') : yes
      const proposal = await ws.api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'business',
          business_id: shop.id,
          revision: shop.revision,
          business: { ...shop.fields, [fact]: value },
        }),
      })
      onReview()
      ws.review(proposal)
    } catch {
      ws.notify(ws.readOnlyMessage ?? t.actionFailed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Box component="section" aria-labelledby="fact-yes-no" sx={{ mt: 4 }}>
      <Typography id="fact-yes-no" variant="bodyLarge">
        {t.customersAsk(t.askNames[fact])}
      </Typography>
      <Stack direction="row" sx={{ gap: 2, mt: 2 }}>
        <Button variant="outlined" disabled={busy} onClick={() => void answer(true)}>
          {t.yes}
        </Button>
        <Button variant="outlined" disabled={busy} onClick={() => void answer(false)}>
          {t.no}
        </Button>
      </Stack>
    </Box>
  )
}
