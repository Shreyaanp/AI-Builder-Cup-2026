import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconButton, Snackbar, useTheme } from '@mui/material'
import { X } from 'lucide-react'
import { canOfferInstall, offerInstall, rememberInstallDeclined } from '../../app/pwa'
import { useCopy } from './strings'
import type { Api, Business, Me, Product, Proposal } from './api'
import { WorkspaceContext } from './workspaceContext'
import type { Destination, Editor, Workspace } from './workspaceContext'
import { ReviewDialog } from './ReviewDialog'
import { BusinessDialog, ProductDialog } from './EditDialogs'
import { FaceDialog } from './FaceDialog'
import { customerShopLink, safeCustomerOrigin } from '../../app/router'

function readSpeak() {
  try {
    // Spoken replies are on unless the owner turned them off in Settings.
    return localStorage.getItem('ogoogle.speakReplies') !== '0'
  } catch {
    return true
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
  const t = useCopy()
  const theme = useTheme()
  const [installOffer, setInstallOffer] = useState(false)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  // Inventory is tagged with its shop so a switch never shows another shop's products.
  const [inventory, setInventory] = useState<{ bid: string | null; items: Product[] }>({
    bid: null,
    items: [],
  })
  const [destination, setDestination] = useState<Destination>('coach')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [toast, setToast] = useState('')
  const [photoPending, setPhotoPending] = useState(false)
  const consumePhotoRequest = useCallback(() => setPhotoPending(false), [])
  // A chat starter from another screen (e.g. My shop's "Customers ask" card).
  const [coachDraft, setCoachDraft] = useState<string | null>(null)
  const consumeCoachDraft = useCallback(() => setCoachDraft(null), [])
  const [coachActions, setCoachActions] = useState(false)
  const [faceOpen, setFaceOpen] = useState(false)
  const [editor, setEditor] = useState<Editor>({ kind: 'none' })
  const [speakReplies, setSpeak] = useState(readSpeak)
  const [customerOrigin, setCustomerOrigin] = useState<string | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    void api<{ customer_origin?: string }>('/bootstrap', { signal: abort.signal })
      .then((config) => {
        if (!abort.signal.aborted) setCustomerOrigin(safeCustomerOrigin(config.customer_origin))
      })
      .catch(() => undefined)
    return () => abort.abort()
  }, [api])

  const loadProducts = useCallback(
    async (id: string | null, signal?: AbortSignal) => {
      if (!id) {
        setInventory({ bid: null, items: [] })
        return
      }
      const items = await api<Product[]>(`/businesses/${id}/inventory`, { signal })
      if (!signal?.aborted) setInventory({ bid: id, items })
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
      // A failed load must not look like an empty workspace (owners would recreate shops).
      .catch(() => {
        if (!abort.signal.aborted) setLoadError(true)
      })
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
        if (!abort.signal.aborted) setInventory({ bid: activeId, items })
      })
      .catch(() => undefined)
    return () => abort.abort()
  }, [activeId, api])

  const setAvailability = useCallback(
    async (product: Product, available: boolean) => {
      if (!activeId || !product.id) return
      // Optimistic: the switch moves at once; a failure restores the saved state.
      setInventory((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === product.id ? { ...item, available } : item,
        ),
      }))
      try {
        await api(`/businesses/${activeId}/inventory/${product.id}/availability`, {
          method: 'POST',
          body: JSON.stringify({ available }),
        })
        await reload()
      } catch {
        setInventory((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === product.id ? { ...item, available: !available } : item,
          ),
        }))
        setToast(t.actionFailed)
      }
    },
    [activeId, api, reload, t.actionFailed],
  )
  const confirm = useCallback(
    async (proposal: Proposal) => {
      const receipt = await api<{ business_id: string }>(`/proposals/${proposal.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ digest: proposal.digest }),
      })
      await reload()
      await loadProducts(receipt.business_id).catch(() => undefined)
      setToast(t.saved)
    },
    [api, reload, loadProducts, t.saved],
  )
  const setShared = useCallback(
    async (shared: boolean) => {
      if (!activeId) return
      await api(`/businesses/${activeId}/share`, {
        method: 'POST',
        body: JSON.stringify({ public: shared }),
      })
      await reload()
    },
    [activeId, api, reload],
  )

  const value = useMemo<Workspace>(
    () => ({
      api,
      me,
      businesses,
      loading,
      loadError,
      retryLoad: async () => {
        setLoadError(false)
        setLoading(true)
        try {
          await reload()
        } catch {
          setLoadError(true)
        } finally {
          setLoading(false)
        }
      },
      activeId,
      active: businesses.find((item) => item.id === activeId) ?? null,
      // Products shown always belong to the active shop.
      products: inventory.bid === activeId ? inventory.items : [],
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
      setAvailability,
      setShared,
      shareUrl: activeId && customerOrigin ? customerShopLink(activeId, customerOrigin) : null,
      review: setProposal,
      confirm,
      notify: setToast,
      requestPhoto: () => {
        setDestination('coach')
        setPhotoPending(true)
      },
      photoPending,
      consumePhotoRequest,
      startCoachDraft: (text: string) => {
        setDestination('coach')
        setCoachDraft(text)
      },
      coachDraft,
      consumeCoachDraft,
      coachActions,
      setCoachActions,
      faceOpen,
      setFaceOpen,
      editor,
      openEditor: setEditor,
    }),
    [
      api,
      customerOrigin,
      me,
      businesses,
      loading,
      loadError,
      activeId,
      inventory,
      destination,
      speakReplies,
      reload,
      setAvailability,
      setShared,
      confirm,
      photoPending,
      consumePhotoRequest,
      coachDraft,
      consumeCoachDraft,
      coachActions,
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
          // Offer installation only after useful progress, never up front.
          if (canOfferInstall()) setInstallOffer(true)
          else setToast(t.saved)
        }}
      />
      <Snackbar
        open={installOffer}
        message={t.install}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return
          setInstallOffer(false)
          rememberInstallDeclined()
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 'calc(96px + env(safe-area-inset-bottom))', sm: 24 } }}
        action={
          <>
            <Button
              color="inherit"
              onClick={() => {
                setInstallOffer(false)
                void offerInstall()
              }}
              sx={{ color: theme.material.inversePrimary }}
            >
              {t.installAction}
            </Button>
            <IconButton
              aria-label={t.close}
              color="inherit"
              onClick={() => {
                setInstallOffer(false)
                rememberInstallDeclined()
              }}
            >
              <X size={18} />
            </IconButton>
          </>
        }
      />
      <BusinessDialog />
      <ProductDialog />
      {value.active && (
        <FaceDialog
          key={faceOpen ? 'open-' + value.active.id : 'closed'}
          open={faceOpen}
          businessId={value.active.id}
          api={api}
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
