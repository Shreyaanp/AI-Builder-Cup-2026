import { useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
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
import { isLanguagePref, resolveLocale } from '../i18n/locales'
import { loadScriptFont } from '../i18n/fonts'
import { configureAnalytics, watchRouteChanges } from './analytics'
import { sideKey } from '../auth/appSide'

/** Kept apart from the preferences object, which older code and tests overwrite whole. */
const languageChosenKey = () => sideKey('language.chosen')
const preferencesKey = () => sideKey('preferences')

/**
 * The pre-split device-wide records. A value not seen before (an older app version or a test
 * wrote it) is copied to both sides once; after that each side's own record wins.
 */
function adoptLegacy(legacy: string, name: string) {
  const value = localStorage.getItem(legacy)
  const seen = `chalkboard.legacy.${name}`
  if (value === null || localStorage.getItem(seen) === value) return
  for (const side of ['owner', 'customer'])
    localStorage.setItem(`chalkboard.${side}.${name}`, value)
  localStorage.setItem(seen, value)
}

type SavedPreferences = Partial<Preferences> & { appearanceChosen?: boolean }

/**
 * OB-195: everyone starts in light, even on a phone set to dark. Dark, or System (follow the
 * phone), only when the person picked it. Older builds saved "system" as the silent default, so
 * "system" counts only with the marker written when it is picked.
 */
function savedAppearance(saved: SavedPreferences): Preferences['appearance'] {
  if (saved?.appearance === 'dark' || saved?.appearance === 'light') return saved.appearance
  return saved?.appearance === 'system' && saved.appearanceChosen === true ? 'system' : 'light'
}

function readPreferences(): Preferences {
  let saved: SavedPreferences = {}
  let chosen = false
  try {
    adoptLegacy('niva.language.chosen', 'language.chosen')
    adoptLegacy('niva.starter.preferences', 'preferences')
    chosen = localStorage.getItem(languageChosenKey()) === '1'
    saved = JSON.parse(localStorage.getItem(preferencesKey()) ?? '{}') as SavedPreferences
  } catch {
    /* Storage may be disabled. */
  }
  const language = isLanguagePref(saved?.language) ? saved.language : 'system'
  return {
    language,
    languageChosen: chosen || language !== 'system',
    appearance: savedAppearance(saved),
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
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true })
  const resolved =
    preferences.appearance === 'system' ? (systemDark ? 'dark' : 'light') : preferences.appearance
  const theme = useMemo(() => nivaTheme(resolved), [resolved])
  const shownMode = useRef(resolved)
  useLayoutEffect(() => {
    if (shownMode.current === resolved) return
    shownMode.current = resolved
    // A light/dark switch repaints at once: colours never fade through a washed-out in-between.
    const style = document.createElement('style')
    style.textContent = '*,*::before,*::after{transition:none!important}'
    document.head.appendChild(style)
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => style.remove()))
    return () => {
      cancelAnimationFrame(frame)
      style.remove()
    }
  }, [resolved])
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
      const display = JSON.stringify({
        language: preferences.language,
        appearance: preferences.appearance,
        // Light is the default, so "system" in state was always picked (see savedAppearance).
        ...(preferences.appearance === 'system' ? { appearanceChosen: true } : {}),
      })
      localStorage.setItem(preferencesKey(), display)
      if (preferences.languageChosen) localStorage.setItem(languageChosenKey(), '1')
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
      <PreferencesDispatchContext value={preferencesDispatch}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
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
