import type { Locale } from '../../i18n/locales'
import type { OwnerStrings } from './copy'

/** Owner rescue, morning brief and radar strings per supported locale. */
export const ownerTranslations: Partial<Record<Exclude<Locale, 'en'>, OwnerStrings>> = {}
