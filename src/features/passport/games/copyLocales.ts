import type { Locale } from '../../../i18n/locales'
import { gamesStrings } from './copy'
import type { GamesStrings } from './copy'

export const gamesTranslations: Record<Exclude<Locale, 'en'>, GamesStrings> = new Proxy(
  {} as Record<Exclude<Locale, 'en'>, GamesStrings>,
  { get: () => gamesStrings },
)
