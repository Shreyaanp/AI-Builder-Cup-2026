import { createContext } from 'react'
import type { FeatureFlags } from './features'
import type { TrustStripConfig } from './trustStrip'
import type { FarewellReason } from './farewellNote'

export interface Identity {
  features: FeatureFlags
  trustStrip?: TrustStripConfig
  mode: 'local' | 'firebase'
  status: 'loading' | 'ready' | 'signed-out' | 'error'
  scope: string
  error: string
  /** The signed-in person's first name (Google account), empty when unknown. */
  name?: string
  getToken: () => Promise<string | null>
  signIn: () => Promise<void>
  signOut: (reason?: FarewellReason) => Promise<void>
}

export const IdentityContext = createContext<Identity | null>(null)
