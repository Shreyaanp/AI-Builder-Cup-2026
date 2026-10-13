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
import { IdentityProvider } from '../auth/IdentityProvider'
import { useIdentity } from '../auth/useIdentity'

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
function BusinessWorkspace({ children }: { children: ReactNode }) {
  const [business, businessDispatch] = useReducer(businessReducer, initialBusiness)
  return (
    <BusinessContext value={business}>
      <BusinessDispatchContext value={businessDispatch}>{children}</BusinessDispatchContext>
    </BusinessContext>
  )
}

function Providers({ children }: { children: ReactNode }) {
  const identity = useIdentity()
  // Initial setup and signed-out preview share drafts. Actual account changes
  // still remount the workspace so one user's private inputs cannot carry over.
  const workspaceScope =
    identity.mode === 'firebase' && identity.status === 'ready'
      ? identity.scope
      : 'unlinked-preview'
  const [preferences, preferencesDispatch] = useReducer(
    preferencesReducer,
    undefined,
    readPreferences,
  )
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
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <BusinessWorkspace key={workspaceScope}>{children}</BusinessWorkspace>
        </ThemeProvider>
      </PreferencesDispatchContext>
    </PreferencesContext>
  )
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <IdentityProvider>
      <Providers>{children}</Providers>
    </IdentityProvider>
  )
}
