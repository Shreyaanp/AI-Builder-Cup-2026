import { accountCopy as t } from './copy'
import type { Profile } from './types'

const languageNames: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  bn: 'Bengali',
  mr: 'Marathi',
  gu: 'Gujarati',
  'zh-Hans': 'Chinese',
  ms: 'Malay',
  ja: 'Japanese',
  ko: 'Korean',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  fil: 'Filipino',
}

export type PreferenceKey = keyof Profile['preferences']

/** Labels for what the profile remembers, each removable on its own. */
export function preferenceChips(profile: Profile | null): { key: PreferenceKey; label: string }[] {
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
      label: t.language.replace('{language}', languageNames[prefs.language] ?? prefs.language),
    },
  ].filter(Boolean) as { key: PreferenceKey; label: string }[]
}
