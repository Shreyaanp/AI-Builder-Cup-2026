import { useId } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { MessageCircle } from 'lucide-react'
import type { ShopFacts } from './api'
import { factEntries, missingFacts } from './shopProgress'
import type { AskFact } from './shopProgress'
import { useCopy } from './strings'

/** Customer facts the owner confirmed, plus (optionally) a way to answer the next one in chat. */
export function FactList({
  fields,
  onAnswer,
}: {
  fields: ShopFacts
  onAnswer?: (fact: AskFact) => void
}) {
  const t = useCopy()
  const titleId = useId()
  const entries = factEntries(fields, t)
  const next = missingFacts(fields)[0]
  if (!entries.length && !(onAnswer && next)) return null
  return (
    <Box component="section" aria-labelledby={titleId}>
      <Typography id={titleId} component="h3" variant="titleSmall" color="text.secondary">
        {t.factsTitle}
      </Typography>
      {entries.length > 0 && (
        <Box
          component="dl"
          sx={{
            m: 0,
            mt: 2,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 4,
          }}
        >
          {entries.map((entry) => (
            <Box key={entry.key} sx={{ minWidth: 0 }}>
              <Typography component="dt" variant="labelMedium" color="text.secondary">
                {entry.label}
              </Typography>
              <Typography
                component="dd"
                variant="bodyLarge"
                sx={{ m: 0, overflowWrap: 'anywhere' }}
              >
                {entry.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {onAnswer && next && (
        <Button
          startIcon={<MessageCircle size={18} />}
          onClick={() => onAnswer(next)}
          sx={{ mt: 2, ml: -2 }}
        >
          {t.customersAsk(t.askNames[next])}
        </Button>
      )}
    </Box>
  )
}
