import type { Locale } from '../../i18n/locales'
import type { RescueStrings } from './copy'

/** Customer rescue strings per supported locale. */
export const rescueTranslations: Partial<Record<Exclude<Locale, 'en'>, RescueStrings>> = {}
