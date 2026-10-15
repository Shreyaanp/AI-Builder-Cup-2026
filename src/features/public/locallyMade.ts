import type { Locale } from '../../i18n/locales'
import { customerEnglish } from './customerCopy'
import { customerTranslations } from './customerLocales'

/** "Locally made" in the customer's language, for chips on cards and shop pages. */
export function locallyMadeLabel(locale: Locale): string {
  return locale === 'en'
    ? customerEnglish.factLocallyMade
    : customerTranslations[locale].factLocallyMade
}
