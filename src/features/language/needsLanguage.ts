import { usePreferences } from '../../state/hooks'

/** The step shows once, right after sign-in, until a language is chosen (here or in You). */
export function useNeedsLanguage(): boolean {
  return !usePreferences().languageChosen
}
