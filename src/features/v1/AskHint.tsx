import { Typography } from '@mui/material'
import { productName } from '../../i18n/productNames'
import { useLocale } from '../../state/hooks'
import { onMenu } from '../shop/stock'
import { askLead, askPhrase, guideFeature, type GuideId } from './askPhrases'
import { useWorkspace } from './workspaceContext'

const SAMPLE_ITEM = /Samosa|समोसा/

/** One quiet line per screen, in the secondary colour. */
export function AskHint({ id }: { id: GuideId }) {
  const locale = useLocale()
  const { products } = useWorkspace()
  const sample = askPhrase(id, locale)
  // The example is about this shop: a samosa means nothing to a minimart or a bakery (OB-271).
  const own = products.some((product) => /samosa/i.test(product.name))
    ? undefined
    : products.find(onMenu)?.name
  const phrase = own ? sample.replace(SAMPLE_ITEM, productName(own, locale)) : sample
  // The lead is in the owner's language; the phrase may be the English one the coach knows,
  // quoted as is (marked English, so readers and translators leave it alone).
  const english = locale !== 'en' && sample === guideFeature(id).ask
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
