import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Dispatch, ReactNode } from 'react'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import { nivaTheme } from '../design/theme'
import {
  BusinessContext,
  BusinessDispatchContext,
  PreferencesContext,
  PreferencesDispatchContext,
} from '../state/contexts'
import { businessReducer, initialBusiness, preferencesReducer } from '../state/model'
import type { Preferences, PreferencesAction } from '../state/model'
import { IdentityProvider } from '../auth/IdentityProvider'
import { useIdentity } from '../auth/useIdentity'
import { useLocale } from '../state/hooks'
import { isLanguagePref, resolveLocale } from '../i18n/locales'
import type { Locale } from '../i18n/locales'
import { loadPack, packReady } from '../i18n/packs'
import { loadScriptFont } from '../i18n/fonts'
import { configureAnalytics, watchRouteChanges } from './analytics'

/** Kept apart from the preferences object, which older code and tests overwrite whole. */
const LANGUAGE_CHOSEN = 'niva.language.chosen'

function readPreferences(): Preferences {
  let saved: Partial<Preferences> = {}
  let chosen = false
  try {
    chosen = localStorage.getItem(LANGUAGE_CHOSEN) === '1'
    saved = JSON.parse(
      localStorage.getItem('niva.starter.preferences') || '{}',
    ) as Partial<Preferences>
  } catch {
    /* Storage may be disabled. */
  }
  const language = isLanguagePref(saved?.language) ? saved.language : 'system'
  return {
    language,
    languageChosen: chosen || language !== 'system',
    appearance:
      saved?.appearance === 'dark' || saved?.appearance === 'light' ? saved.appearance : 'light',
    destination: 'coach',
  }
}

/** Keep the app hidden until its saved language's copy chunk is ready. */
function LocalePackGate({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const [readyLocale, setReadyLocale] = useState<Locale | null>(() =>
    packReady(locale) ? locale : null,
  )

  useEffect(() => {
    let active = true
    void loadPack(locale).then(() => {
      if (active) setReadyLocale(locale)
    })
    return () => {
      active = false
    }
  }, [locale])

  return readyLocale === locale || packReady(locale) ? children : null
}
function BusinessWorkspace({ children }: { children: ReactNode }) {
  const [business, businessDispatch] = useReducer(businessReducer, initialBusiness)
  return (
    <BusinessContext value={business}>
      <BusinessDispatchContext value={businessDispatch}>{children}</BusinessDispatchContext>
    </BusinessContext>
  )
}

function OwnedWorkspace({ children }: { children: ReactNode }) {
  const identity = useIdentity()
  // Initial setup and signed-out preview share drafts. Actual account changes
  // still remount the workspace so one user's private inputs cannot carry over.
  const workspaceScope =
    identity.mode === 'firebase' && identity.status === 'ready'
      ? identity.scope
      : 'unlinked-preview'
  return <BusinessWorkspace key={workspaceScope}>{children}</BusinessWorkspace>
}

function Providers({
  children,
  analyticsApp,
}: {
  children: ReactNode
  analyticsApp?: 'owner' | 'customer'
}) {
  const [preferences, preferencesDispatch] = useReducer(
    preferencesReducer,
    undefined,
    readPreferences,
  )
  const languageRequest = useRef(0)
  const dispatchPreferences = useCallback<Dispatch<PreferencesAction>>(
    (action) => {
      if (action.type !== 'language') {
        preferencesDispatch(action)
        return
      }
      const request = ++languageRequest.current
      void loadPack(resolveLocale(action.language)).then(() => {
        if (request === languageRequest.current) preferencesDispatch(action)
      })
    },
    [preferencesDispatch],
  )
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true })
  const resolved =
    preferences.appearance === 'system' ? (systemDark ? 'dark' : 'light') : preferences.appearance
  const theme = useMemo(() => nivaTheme(resolved), [resolved])
  useEffect(() => {
    // Keep the PWA/browser chrome in step with the active surface colour.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme.material.surface)
  }, [theme])
  useEffect(() => {
    const locale = resolveLocale(preferences.language)
    document.documentElement.lang = locale
    void loadScriptFont(locale)
    try {
      localStorage.setItem(
        'niva.starter.preferences',
        JSON.stringify({ language: preferences.language, appearance: preferences.appearance }),
      )
      if (preferences.languageChosen) localStorage.setItem(LANGUAGE_CHOSEN, '1')
    } catch {
      /* App remains usable without storage. */
    }
  }, [preferences.language, preferences.appearance, preferences.languageChosen])
  useEffect(() => {
    // The marketing page loads no app configuration.
    if (!analyticsApp) return
    const stopWatching = watchRouteChanges()
    const abort = new AbortController()
    void fetch('/api/v1/bootstrap', { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: { ga_measurement_id?: string } | null) => {
        if (!abort.signal.aborted) {
          const region = navigator.languages.some((language) => /-SG(?:-|$)/i.test(language))
            ? 'SG'
            : 'IN'
          configureAnalytics(config?.ga_measurement_id ?? '', false, analyticsApp, region)
        }
      })
      .catch(() => undefined)
    return () => {
      abort.abort()
      stopWatching()
    }
  }, [analyticsApp])
  return (
    <PreferencesContext value={preferences}>
      <PreferencesDispatchContext value={dispatchPreferences}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <LocalePackGate>{children}</LocalePackGate>
        </ThemeProvider>
      </PreferencesDispatchContext>
    </PreferencesContext>
  )
}

export function AppProviders({
  children,
  business = true,
  analyticsApp,
}: {
  children: ReactNode
  business?: boolean
  analyticsApp?: 'owner' | 'customer'
}) {
  if (!business) return <Providers analyticsApp={analyticsApp}>{children}</Providers>
  return (
    <IdentityProvider>
      <Providers analyticsApp={analyticsApp}>
        <OwnedWorkspace>{children}</OwnedWorkspace>
      </Providers>
    </IdentityProvider>
  )
}
