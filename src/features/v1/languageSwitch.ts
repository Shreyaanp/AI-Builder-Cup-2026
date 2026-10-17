import { useCallback } from 'react'
import type { CoachEvent } from '../../api/stream'
import { isLanguagePref } from '../../i18n/locales'
import { usePreferencesDispatch } from '../../state/hooks'

/**
 * The owner asked the coach, by voice or text, to speak another language ("English mein bolo"):
 * the app's own language setting follows, so the next turn and voice session use it too.
 */
export function useLanguageSwitch() {
  const dispatch = usePreferencesDispatch()
  return useCallback(
    (event: CoachEvent) => {
      if (event.kind !== 'action' || event.data?.target !== 'language') return
      const language = event.data.language
      if (isLanguagePref(language) && language !== 'system')
        dispatch({ type: 'language', language })
    },
    [dispatch],
  )
}
