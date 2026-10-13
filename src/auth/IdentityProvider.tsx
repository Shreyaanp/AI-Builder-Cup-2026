import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Auth } from 'firebase/auth'
import { IdentityContext } from './context'
import type { Identity } from './context'

type Operations = { auth: Auth; signIn: () => Promise<void>; signOut: () => Promise<void> }

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Pick<Identity, 'mode' | 'status' | 'scope' | 'error'>>({
    mode: 'local',
    status: 'loading',
    scope: 'loading',
    error: '',
  })
  const operations = useRef<Operations | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let unsubscribe: (() => void) | undefined
    async function connect() {
      try {
        const response = await fetch('/api/v1/bootstrap', {
          signal: controller.signal,
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error('Session setup failed.')
        const value: unknown = await response.json()
        if (!value || typeof value !== 'object' || !('auth_mode' in value))
          throw new Error('Invalid identity configuration.')
        if (controller.signal.aborted) return
        if (value.auth_mode === 'local') {
          setState({ mode: 'local', status: 'ready', scope: 'local-preview', error: '' })
          return
        }
        if (
          value.auth_mode !== 'firebase' ||
          !('firebase' in value) ||
          !value.firebase ||
          typeof value.firebase !== 'object'
        ) {
          throw new Error('Invalid identity configuration.')
        }
        const fields = value.firebase as Record<string, unknown>
        const configuration: Record<string, string> = {}
        for (const name of ['apiKey', 'appId', 'authDomain', 'projectId']) {
          if (typeof fields[name] !== 'string' || !fields[name])
            throw new Error('Sign-in is not configured yet.')
          configuration[name] = fields[name]
        }
        const [appSdk, authSdk] = await Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
        ])
        if (controller.signal.aborted) return
        const name = `ogoogle-web-${configuration.projectId}`
        const app =
          appSdk.getApps().find((candidate) => candidate.name === name) ??
          appSdk.initializeApp(configuration, name)
        const auth = authSdk.getAuth(app)
        operations.current = {
          auth,
          signIn: async () => {
            await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider())
          },
          signOut: () => authSdk.signOut(auth),
        }
        unsubscribe = authSdk.onIdTokenChanged(
          auth,
          (user) => {
            if (!controller.signal.aborted)
              setState({
                mode: 'firebase',
                status: user ? 'ready' : 'signed-out',
                scope: user ? `firebase:${user.uid}` : 'signed-out',
                error: '',
              })
          },
          () => {
            if (!controller.signal.aborted)
              setState({
                mode: 'firebase',
                status: 'error',
                scope: 'signed-out',
                error: 'Sign-in could not be restored.',
              })
          },
        )
      } catch {
        if (!controller.signal.aborted)
          setState({
            mode: 'firebase',
            status: 'error',
            scope: 'signed-out',
            error: 'Sign-in setup is unavailable. Your inputs stay on this device.',
          })
      }
    }
    void connect()
    return () => {
      controller.abort()
      unsubscribe?.()
      operations.current = null
    }
  }, [])

  async function signIn() {
    try {
      if (!operations.current) return
      await operations.current.signIn()
    } catch {
      setState((current) => ({ ...current, error: 'Sign-in did not finish. Please try again.' }))
    }
  }
  async function signOut() {
    try {
      await operations.current?.signOut()
    } catch {
      setState((current) => ({ ...current, error: 'Sign-out did not finish. Please try again.' }))
    }
  }
  async function getToken(): Promise<string | null> {
    if (state.mode === 'local' && state.status === 'ready') return null
    const user = operations.current?.auth.currentUser
    if (!user) throw new Error('Sign in with Google to use your private conversations.')
    return user.getIdToken()
  }
  return (
    <IdentityContext value={{ ...state, getToken, signIn, signOut }}>{children}</IdentityContext>
  )
}
