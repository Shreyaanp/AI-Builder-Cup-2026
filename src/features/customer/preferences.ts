import type { AccountCopy } from './copy'
import type { Profile } from './types'

export type PreferenceKey = keyof Profile['preferences']

/** A remembered language code named in the viewer's own language ("Tamil", "தமிழ்"…). */
function languageName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Labels for what the profile remembers, each removable on its own. */
export function preferenceChips(
  profile: Profile | null,
  t: AccountCopy,
  locale: string,
): { key: PreferenceKey; label: string }[] {
  const prefs = profile?.preferences
  if (!prefs) return []
  return [
    prefs.vegetarian && { key: 'vegetarian' as const, label: t.vegetarian },
    prefs.halal && { key: 'halal' as const, label: t.halal },
    prefs.budget != null && {
      key: 'budget' as const,
      label: t.budget.replace('{amount}', String(prefs.budget)),
    },
    prefs.language && {
      key: 'language' as const,
      label: t.language.replace('{language}', languageName(prefs.language, locale)),
    },
  ].filter(Boolean) as { key: PreferenceKey; label: string }[]
}
