import type { Locale } from '../../i18n/locales'
import type { PassportStrings } from './copy'
import { asian } from './locales/asian'
import { indic } from './locales/indic'
import { latin } from './locales/latin'

/** Every passport, stamp moment and Today's 7 string, per supported locale. */
export const passportTranslations: Record<Exclude<Locale, 'en'>, PassportStrings> = {
  ...indic,
  ...asian,
  ...latin,
}
