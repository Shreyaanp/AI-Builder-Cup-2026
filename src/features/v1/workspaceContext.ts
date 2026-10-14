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
  /**
   * Save a sealed proposal the owner has just seen in full and tapped to confirm in place
   * (e.g. one inline price change), then refresh. Same exact-digest approval as the review.
   */
  confirm: (proposal: Proposal) => Promise<void>
  notify: (message: string) => void
  /** Ask the Coach screen to open the photo picker (from empty states and suggestions). */
  requestPhoto: () => void
  photoPending: boolean
  consumePhotoRequest: () => void
  /** Open the Coach with a started message in the composer (the owner finishes and sends). */
  startCoachDraft: (text: string, options?: { send?: boolean }) => void
  coachDraft: string | null
  /** The pending draft should be sent at once instead of waiting in the composer. */
  coachDraftSend: boolean
  consumeCoachDraft: () => void
  /** The coach's "+" sheet (new chat, add shop or product, earlier chats); the top bar opens it. */
  coachActions: boolean
  setCoachActions: (open: boolean) => void
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
