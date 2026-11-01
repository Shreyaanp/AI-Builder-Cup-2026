import { Typography } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { askLead, askPhrase, guideFeature, type GuideId } from './askPhrases'

/** One quiet line per screen, in the secondary colour. */
export function AskHint({ id }: { id: GuideId }) {
  const locale = useLocale()
  const phrase = askPhrase(id, locale)
  // The lead is in the owner's language; the phrase may be the English one the coach knows,
  // quoted as is (marked English, so readers and translators leave it alone).
  const english = locale !== 'en' && phrase === guideFeature(id).ask
  const [before, after] = askLead[locale]('\u0000').split('\u0000')
  return (
    <Typography
      variant="bodyMedium"
      color="text.secondary"
      data-testid="ask-hint"
      sx={{ mt: 4, overflowWrap: 'anywhere' }}
    >
      {before}
      {english ? (
        <span lang="en" translate="no">
          {phrase}
        </span>
      ) : (
        phrase
      )}
      {after}
    </Typography>
  )
}
