import { createContext } from 'react'

export interface Identity {
  mode: 'local' | 'firebase'
  status: 'loading' | 'ready' | 'signed-out' | 'error'
  scope: string
  error: string
  /** The signed-in person's first name (Google account), empty when unknown. */
  name?: string
  getToken: () => Promise<string | null>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const IdentityContext = createContext<Identity | null>(null)
