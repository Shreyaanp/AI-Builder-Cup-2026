import { useContext } from 'react'
import { resolveLocale } from '../i18n/locales'
import type { Locale } from '../i18n/locales'
import {
  BusinessContext,
  BusinessDispatchContext,
  PreferencesContext,
  PreferencesDispatchContext,
} from './contexts'

export function useBusiness() {
  const state = useContext(BusinessContext)
  if (state === null) throw new Error('useBusiness requires AppProviders')
  return state
}
export function useBusinessDispatch() {
  const dispatch = useContext(BusinessDispatchContext)
  if (dispatch === null) throw new Error('useBusinessDispatch requires AppProviders')
  return dispatch
}
export function usePreferences() {
  const state = useContext(PreferencesContext)
  if (state === null) throw new Error('usePreferences requires AppProviders')
  return state
}
export function usePreferencesDispatch() {
  const dispatch = useContext(PreferencesDispatchContext)
  if (dispatch === null) throw new Error('usePreferencesDispatch requires AppProviders')
  return dispatch
}

/** The UI locale in effect: the phone's language unless the owner chose one in Settings. */
export function useLocale(): Locale {
  return resolveLocale(usePreferences().language)
}
