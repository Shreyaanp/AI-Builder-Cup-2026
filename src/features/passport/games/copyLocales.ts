import type { Locale } from '../../../i18n/locales'
import type { GamesStrings } from './copy'
import { asian } from './locales/asian'
import { indic } from './locales/indic'
import { latin } from './locales/latin'

/** Every game string, per supported locale. */
export const gamesTranslations: Record<Exclude<Locale, 'en'>, GamesStrings> = {
  ...indic,
  ...asian,
  ...latin,
}
