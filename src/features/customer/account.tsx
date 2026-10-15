import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Auth } from 'firebase/auth'

export type { Profile } from './types'
import type { Me, Profile } from './types'

/**
 * The customer's own account. Browsing and instant answers never need it; messaging an owner,
 * syncing follows, preferences and tips do. Hosted: Google sign-in (Firebase). Local and tests:
 * an explicit stand-in session, so the sign-in gate is real everywhere.
 */
export interface CustomerAccount {
  status: 'loading' | 'signed-out' | 'signed-in'
  mode: 'local' | 'firebase'
  name: string
  profile: Profile | null
  error: string
  signIn: () => Promise<boolean>
  signOut: () => Promise<void>
  /** Same-origin fetch with the customer's credentials. Throws `Error(status)` on failure. */
  api: <T>(path: string, init?: RequestInit) => Promise<T>
  /** The same credentials on a raw response (live streams). */
  raw: (path: string, init?: RequestInit) => Promise<Response>
  setProfile: (profile: Profile) => void
  /** Followed shop IDs: the account's when signed in, this device's otherwise. */
  follows: string[]
  setFollow: (id: string, on: boolean) => Promise<void>
  /** Unread owner replies across chats (refreshed while the app is open). */
  unread: number
  refreshUnread: () => void
}

const Context = createContext<CustomerAccount | null>(null)
const LOCAL_FOLLOWS = 'chalkboard.customer.follows'

function localFollows(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LOCAL_FOLLOWS) || '[]')
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}
function saveLocalFollows(ids: string[]) {
  try {
    localStorage.setItem(LOCAL_FOLLOWS, JSON.stringify(ids.slice(0, 100)))
  } catch {
    /* Following still works for this visit. */
  }
}

type Firebase = { auth: Auth; signIn: () => Promise<void>; signOut: () => Promise<void> }

export function CustomerAccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CustomerAccount['status']>('loading')
  const [mode, setMode] = useState<CustomerAccount['mode']>('local')
  const [name, setName] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [deviceFollows, setDeviceFollows] = useState<string[]>(localFollows)
  const [unread, setUnread] = useState(0)
  const firebase = useRef<Firebase | null>(null)

  const raw = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const user = firebase.current?.auth.currentUser
    if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`)
    return fetch(path, { ...init, headers, credentials: 'same-origin' })
  }, [])
  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const response = await raw(path, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(25_000),
      })
      if (!response.ok) throw new Error(String(response.status))
      return (await response.json()) as T
    },
    [raw],
  )

  const load = useCallback(async () => {
    try {
      const me = await api<Me>('/api/v1/customer/me')
      if (me.signed_in && me.profile) {
        // Follows made on this device before signing in move into the account.
        const pending = localFollows().filter((id) => !me.profile!.follows.includes(id))
        let latest = me.profile
        for (const id of pending) {
          try {
            latest = await api<Profile>(`/api/v1/customer/follows/${encodeURIComponent(id)}`, {
              method: 'PUT',
            })
          } catch {
            /* A shop that stopped sharing cannot be followed. */
          }
        }
        if (pending.length) {
          saveLocalFollows([])
          setDeviceFollows([])
        }
        setProfile(latest)
        setName(me.name)
        setStatus('signed-in')
      } else {
        setProfile(null)
        setStatus('signed-out')
      }
    } catch {
      setStatus('signed-out')
    }
  }, [api])

  useEffect(() => {
    const abort = new AbortController()
    let unsubscribe: (() => void) | undefined
    async function connect() {
      try {
        const response = await fetch('/api/v1/bootstrap', {
          signal: abort.signal,
          credentials: 'same-origin',
        })
        const value = (await response.json()) as {
          auth_mode?: string
          firebase?: Record<string, string>
        }
        if (abort.signal.aborted) return
        if (value.auth_mode !== 'firebase' || !value.firebase) {
          setMode('local')
          await load()
          return
        }
        setMode('firebase')
        const config = value.firebase
        const [appSdk, authSdk] = await Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
        ])
        if (abort.signal.aborted) return
        const appName = `ogoogle-web-${config.projectId}`
        const app =
          appSdk.getApps().find((candidate) => candidate.name === appName) ??
          appSdk.initializeApp(config, appName)
        const auth = authSdk.getAuth(app)
        firebase.current = {
          auth,
          signIn: async () => {
            await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider())
          },
          signOut: () => authSdk.signOut(auth),
        }
        unsubscribe = authSdk.onIdTokenChanged(auth, (user) => {
          if (abort.signal.aborted) return
          if (user) void load()
          else {
            setProfile(null)
            setStatus('signed-out')
          }
        })
      } catch {
        if (!abort.signal.aborted) {
          setStatus('signed-out')
          setError('Sign-in is unavailable right now. Browsing still works.')
        }
      }
    }
    void connect()
    return () => {
      abort.abort()
      unsubscribe?.()
    }
  }, [load])

  const signIn = useCallback(async () => {
    setError('')
    try {
      if (mode === 'firebase') {
        await firebase.current?.signIn()
        return !!firebase.current?.auth.currentUser
      }
      await api<Me>('/api/v1/customer/session', {
        method: 'POST',
        body: JSON.stringify({ name: 'Asha' }),
      })
      await load()
      return true
    } catch {
      setError('Sign-in did not finish. Please try again.')
      return false
    }
  }, [api, load, mode])

  const signOut = useCallback(async () => {
    try {
      if (mode === 'firebase') await firebase.current?.signOut()
      else await api('/api/v1/customer/session', { method: 'DELETE' })
    } finally {
      setProfile(null)
      setName('')
      setUnread(0)
      setStatus('signed-out')
    }
  }, [api, mode])

  const refreshUnread = useCallback(() => {
    if (status !== 'signed-in') return
    api<{ unread: number }[]>('/api/v1/customer/threads')
      .then((chats) => setUnread(chats.reduce((sum, chat) => sum + chat.unread, 0)))
      .catch(() => {
        /* The badge keeps its last value. */
      })
  }, [api, status])
  useEffect(() => {
    if (status !== 'signed-in') return
    refreshUnread()
    // Owner replies light up the Chats badge while the app is open.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshUnread()
    }, 15_000)
    return () => clearInterval(timer)
  }, [status, refreshUnread])

  const follows = useMemo(
    () => (status === 'signed-in' && profile ? profile.follows : deviceFollows),
    [status, profile, deviceFollows],
  )

  const setFollow = useCallback(
    async (id: string, on: boolean) => {
      if (status === 'signed-in') {
        const next = await api<Profile>(`/api/v1/customer/follows/${encodeURIComponent(id)}`, {
          method: on ? 'PUT' : 'DELETE',
        })
        setProfile(next)
        return
      }
      const next = on
        ? [id, ...localFollows().filter((v) => v !== id)]
        : localFollows().filter((v) => v !== id)
      saveLocalFollows(next)
      setDeviceFollows(next)
    },
    [api, status],
  )

  const value = useMemo<CustomerAccount>(
    () => ({
      status,
      mode,
      name,
      profile,
      error,
      signIn,
      signOut,
      api,
      raw,
      setProfile,
      follows,
      setFollow,
      unread,
      refreshUnread,
    }),
    [
      status,
      mode,
      name,
      profile,
      error,
      signIn,
      signOut,
      api,
      raw,
      follows,
      setFollow,
      unread,
      refreshUnread,
    ],
  )
  return <Context value={value}>{children}</Context>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCustomer() {
  const value = useContext(Context)
  if (!value) throw new Error('Customer account provider is missing.')
  return value
}
