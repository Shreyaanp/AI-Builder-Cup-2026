import { useEffect, useMemo, useReducer } from 'react'
import type { ReactNode } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { nivaTheme } from '../design/theme'
import {
  BusinessContext,
  BusinessDispatchContext,
  PreferencesContext,
  PreferencesDispatchContext,
} from '../state/contexts'
import { businessReducer, initialBusiness, preferencesReducer } from '../state/model'
import type { Preferences } from '../state/model'

function readPreferences(): Preferences {
  let saved: Partial<Preferences> = {}
  try {
    saved = JSON.parse(
      localStorage.getItem('niva.starter.preferences') || '{}',
    ) as Partial<Preferences>
  } catch {
    /* Storage may be disabled. */
  }
  return {
    language: saved?.language === 'hi' ? 'hi' : 'en',
    appearance: saved?.appearance === 'dark' ? 'dark' : 'light',
    destination: 'coach',
  }
}
export function AppProviders({ children }: { children: ReactNode }) {
  const [preferences, preferencesDispatch] = useReducer(
    preferencesReducer,
    undefined,
    readPreferences,
  )
  const [business, businessDispatch] = useReducer(businessReducer, initialBusiness)
  const theme = useMemo(() => nivaTheme(preferences.appearance), [preferences.appearance])
  useEffect(() => {
    document.documentElement.lang = preferences.language
    try {
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ language: preferences.language, appearance: preferences.appearance }),
      )
    } catch {
      /* App remains usable without storage. */
    }
  }, [preferences.language, preferences.appearance])
  return (
    <PreferencesContext value={preferences}>
      <PreferencesDispatchContext value={preferencesDispatch}>
        <BusinessContext value={business}>
          <BusinessDispatchContext value={businessDispatch}>
            <ThemeProvider theme={theme}>
              <CssBaseline />
              {children}
            </ThemeProvider>
          </BusinessDispatchContext>
        </BusinessContext>
      </PreferencesDispatchContext>
    </PreferencesContext>
  )
}
