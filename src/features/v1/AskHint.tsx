import { Typography } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { askLead, askPhrase, type GuideId } from './askPhrases'

/** One quiet line per screen, in the secondary colour. */
export function AskHint({ id }: { id: GuideId }) {
  const locale = useLocale()
  return (
    <Typography
      variant="bodyMedium"
      color="text.secondary"
      data-testid="ask-hint"
      sx={{ mt: 4, overflowWrap: 'anywhere' }}
    >
      {askLead[locale](askPhrase(id, locale))}
    </Typography>
  )
}
