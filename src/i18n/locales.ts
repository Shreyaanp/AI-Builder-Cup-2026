/**
 * Supported UI locales. The app follows the phone's language setting (navigator.languages),
 * never location; English is the default and the source for every translation.
 * First set: Singapore's official languages + main APAC markets.
 */
export const LOCALES = ['en', 'zh-Hans', 'ms', 'ta', 'ja', 'ko', 'id', 'th', 'vi', 'fil'] as const
export type Locale = (typeof LOCALES)[number]
/** User preference: follow the phone, or a fixed locale chosen in Settings. */
export type LanguagePref = 'system' | Locale

/** Each language's own name, shown in Settings so speakers recognise it. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  ms: 'Bahasa Melayu',
  ta: 'தமிழ்',
  ja: '日本語',
  ko: '한국어',
  id: 'Bahasa Indonesia',
  th: 'ไทย',
  vi: 'Tiếng Việt',
  fil: 'Filipino',
}

/** Map a BCP 47 tag from the browser to a supported locale (undefined if unsupported). */
function matchOne(tag: string): Locale | undefined {
  const lower = tag.toLowerCase()
  const base = lower.split('-')[0] ?? ''
  if (base === 'zh') return 'zh-Hans' // Traditional Chinese readers get Simplified until zh-Hant ships.
  if (base === 'in') return 'id' // Legacy Indonesian code still sent by some Android builds.
  if (base === 'tl') return 'fil'
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : undefined
}

/** The first supported language in the phone's preference order; English otherwise. */
export function systemLocale(languages: readonly string[] = navigator.languages ?? []): Locale {
  for (const tag of languages.length ? languages : [navigator.language ?? 'en']) {
    const found = matchOne(tag)
    if (found) return found
  }
  return 'en'
}

export function resolveLocale(pref: LanguagePref): Locale {
  return pref === 'system' ? systemLocale() : pref
}

export function isLanguagePref(value: unknown): value is LanguagePref {
  return value === 'system' || (LOCALES as readonly unknown[]).includes(value)
}
