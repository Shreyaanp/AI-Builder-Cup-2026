import { Box, MenuItem, TextField } from '@mui/material'
import { useWorkspace } from '../workspaceContext'
import { setFrequency, useCardChoices, type Frequency } from './cardChoices'
import { useCardsMoreCopy } from './cardsMoreCopy'
import { useToday } from './useToday'

const FREQUENCIES: Frequency[] = ['daily', 'important', 'off']

/**
 * How often cards come on Home (OB-176): every day, only important ones, or off. Saved for the
 * shop on the server, so every phone and Today follow the same choice at once.
 */
export function CardSettings() {
  const ws = useWorkspace()
  const c = useCardsMoreCopy()
  const facts = useToday()
  const shopId = ws.active?.id
  const cards = useCardChoices(shopId, facts?.cards)
  if (!shopId || !cards) return null
  return (
    <Box sx={{ px: 3, py: 2 }}>
      <TextField
        select
        fullWidth
        label={c.howOften}
        helperText={c.howOftenHint}
        value={cards.frequency}
        sx={{ '& .MuiSelect-select': { typography: 'bodyLarge', py: 4, pl: 4 } }}
        onChange={(event) => {
          const chosen = event.target.value as Frequency
          void setFrequency(ws.api, shopId, cards, chosen).then((saved) => {
            if (!saved) ws.notify(c.failed)
          })
        }}
      >
        {FREQUENCIES.map((frequency) => (
          <MenuItem key={frequency} value={frequency}>
            {c.frequency[frequency]}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  )
}
