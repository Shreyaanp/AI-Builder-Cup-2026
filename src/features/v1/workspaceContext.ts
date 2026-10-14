import { createContext, use } from 'react'
import type { Api, Business, Me, Product, Proposal } from './api'

export type Destination = 'coach' | 'shop' | 'google' | 'privacy'

export interface Workspace {
  api: Api
  me: Me
  businesses: Business[]
  loading: boolean
  /** Shops could not be loaded; show recovery, never the empty "add your shop" state. */
  loadError: boolean
  retryLoad: () => Promise<void>
  activeId: string | null
  active: Business | null
  products: Product[]
  destination: Destination
  speakReplies: boolean
  setSpeakReplies: (value: boolean) => void
  go: (destination: Destination) => void
  select: (id: string | null) => void
  reload: () => Promise<void>
  /** Owner's immediate sold-out switch. */
  setAvailability: (product: Product, available: boolean) => Promise<void>
  /** Turns the public customer page on or off. */
  setShared: (shared: boolean) => Promise<void>
  shareUrl: string | null
  /** Show an exact proposal for owner review; saving happens only from the review dialog. */
  review: (proposal: Proposal) => void
  notify: (message: string) => void
  /** Ask the Coach screen to open the photo picker (from empty states and suggestions). */
  requestPhoto: () => void
  photoPending: boolean
  consumePhotoRequest: () => void
  /** Opens the optional duplicate-owner check (Privacy). */
  faceOpen: boolean
  setFaceOpen: (open: boolean) => void
  editor: Editor
  openEditor: (editor: Editor) => void
}

export type Editor =
  | { kind: 'none' }
  | { kind: 'business'; fields: Business['fields'] | null }
  | { kind: 'product'; product: Product | null }

export const WorkspaceContext = createContext<Workspace | null>(null)

export function useWorkspace(): Workspace {
  const value = use(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}
