import { createContext } from 'react'
import type { FeatureFlags } from './features'

export interface Identity {
  features: FeatureFlags
  mode: 'local' | 'firebase'
  status: 'loading' | 'ready' | 'signed-out' | 'error'
  scope: string
  error: string
  getToken: () => Promise<string | null>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export const IdentityContext = createContext<Identity | null>(null)
