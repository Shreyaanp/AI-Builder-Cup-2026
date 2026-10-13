import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Snackbar } from '@mui/material'
import type { Api, Business, Me, Product, Proposal } from './api'
import { WorkspaceContext } from './workspaceContext'
import type { Destination, Editor, Workspace } from './workspaceContext'
import { ReviewDialog } from './ReviewDialog'
import { BusinessDialog, ProductDialog } from './EditDialogs'
import { FaceDialog } from './FaceDialog'
import { usePreferences } from '../../state/hooks'

function readSpeak() {
  try {
    return localStorage.getItem('ogoogle.speakReplies') === '1'
  } catch {
    return false
  }
}

export function WorkspaceProvider({
  api,
  me,
  children,
}: {
  api: Api
  me: Me
  children: ReactNode
}) {
  const { language } = usePreferences()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [destination, setDestination] = useState<Destination>('coach')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [toast, setToast] = useState('')
  const [photoPending, setPhotoPending] = useState(false)
  const consumePhotoRequest = useCallback(() => setPhotoPending(false), [])
  const [faceOpen, setFaceOpen] = useState(false)
  const [editor, setEditor] = useState<Editor>({ kind: 'none' })
  const [speakReplies, setSpeak] = useState(readSpeak)

  const loadProducts = useCallback(
    async (id: string | null, signal?: AbortSignal) => {
      if (!id) {
        setProducts([])
        return
      }
      const items = await api<Product[]>(`/businesses/${id}/inventory`, { signal })
      if (!signal?.aborted) setProducts(items)
    },
    [api],
  )
  const reload = useCallback(async () => {
    const items = await api<Business[]>('/businesses')
    setBusinesses(items)
    setActiveId((current) =>
      current && items.some((item) => item.id === current) ? current : (items[0]?.id ?? null),
    )
  }, [api])

  useEffect(() => {
    const abort = new AbortController()
    void api<Business[]>('/businesses', { signal: abort.signal })
      .then((items) => {
        if (abort.signal.aborted) return
        setBusinesses(items)
        setActiveId(items[0]?.id ?? null)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    return () => abort.abort()
  }, [api])
  useEffect(() => {
    if (!activeId) return
    const abort = new AbortController()
    void api<Product[]>(`/businesses/${activeId}/inventory`, { signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted) setProducts(items)
      })
      .catch(() => undefined)
    return () => abort.abort()
  }, [activeId, api])

  const value = useMemo<Workspace>(
    () => ({
      api,
      me,
      businesses,
      loading,
      activeId,
      active: businesses.find((item) => item.id === activeId) ?? null,
      // Products shown always belong to the active shop.
      products: activeId ? products : [],
      destination,
      speakReplies,
      setSpeakReplies: (next) => {
        setSpeak(next)
        if (!next) speechSynthesis.cancel()
        try {
          localStorage.setItem('ogoogle.speakReplies', next ? '1' : '0')
        } catch {
          /* Preference stays for this session. */
        }
      },
      go: setDestination,
      select: setActiveId,
      reload,
      review: setProposal,
      notify: setToast,
      requestPhoto: () => {
        setDestination('coach')
        setPhotoPending(true)
      },
      photoPending,
      consumePhotoRequest,
      faceOpen,
      setFaceOpen,
      editor,
      openEditor: setEditor,
    }),
    [
      api,
      me,
      businesses,
      loading,
      activeId,
      products,
      destination,
      speakReplies,
      reload,
      photoPending,
      consumePhotoRequest,
      faceOpen,
      editor,
    ],
  )

  return (
    <WorkspaceContext value={value}>
      {children}
      <ReviewDialog
        proposal={proposal}
        onClose={() => setProposal(null)}
        onSaved={async (businessId) => {
          setProposal(null)
          await reload()
          setActiveId(businessId)
          await loadProducts(businessId).catch(() => undefined)
          setToast(language === 'hi' ? 'à¤¸à¤¹à¥‡à¤œà¤¾ à¤—à¤¯à¤¾' : 'Saved')
        }}
      />
      <BusinessDialog />
      <ProductDialog />
      {value.active && (
        <FaceDialog
          key={faceOpen ? 'open-' + value.active.id : 'closed'}
          open={faceOpen}
          businessId={value.active.id}
          api={api}
          language={language}
          onClose={() => setFaceOpen(false)}
          onResult={() => {
            void reload()
          }}
        />
      )}
      <Snackbar
        open={Boolean(toast)}
        message={toast}
        autoHideDuration={4000}
        onClose={() => setToast('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 'calc(96px + env(safe-area-inset-bottom))', sm: 24 } }}
      />
    </WorkspaceContext>
  )
}
