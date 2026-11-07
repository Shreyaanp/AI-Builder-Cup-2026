import { useEffect, useRef, useState } from 'react'
import { useDemoCopy } from '../frontdoors/strings'
import { useWorkspace } from '../v1/workspaceContext'
import { kindOf, type GalleryKind } from './galleryGroups'

export const GALLERY_LIMIT = 12

/**
 * The active shop's gallery. Owner photo requests need the sign-in header, so images are
 * fetched and shown as object URLs (revoked when they leave the gallery or the screen).
 */
export function useGallery() {
  const ws = useWorkspace()
  const demo = useDemoCopy()
  const shop = ws.active
  const ids = shop?.gallery ?? []
  const kinds = Object.fromEntries(ids.map((id) => [id, kindOf(shop?.photo_kinds?.[id])]))
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const live = useRef<Record<string, string>>({})
  const key = `${shop?.id ?? ''}:${ids.join(',')}`

  useEffect(() => {
    if (!shop) return
    const abort = new AbortController()
    for (const id of ids) {
      if (live.current[id]) continue
      void ws
        .api<Response>(`/businesses/${encodeURIComponent(shop.id)}/gallery/${id}.jpg`, {
          raw: true,
          signal: abort.signal,
        })
        .then((response) => response.blob())
        .then((blob) => {
          if (abort.signal.aborted) return
          const url = URL.createObjectURL(blob)
          live.current[id] = url
          setUrls((current) => ({ ...current, [id]: url }))
        })
        .catch(() => undefined)
    }
    for (const [id, url] of Object.entries(live.current)) {
      if (!ids.includes(id)) {
        URL.revokeObjectURL(url)
        delete live.current[id]
      }
    }
    return () => abort.abort()
    // `key` captures the shop and its photo list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(
    () => () => {
      for (const url of Object.values(live.current)) URL.revokeObjectURL(url)
      live.current = {}
    },
    [],
  )

  async function add(file: File, kind: GalleryKind = 'other') {
    if (!shop || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const added = await ws.api<{ sample?: boolean }>(
        `/businesses/${encodeURIComponent(shop.id)}/gallery?kind=${kind}`,
        {
          method: 'POST',
          body: file,
          headers: { 'Content-Type': file.type || 'image/jpeg' },
          signal: AbortSignal.timeout(150_000),
        },
      )
      await ws.reload()
      if (added.sample) ws.notify(demo.samplePhoto)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!shop) return
    try {
      await ws.api(`/businesses/${encodeURIComponent(shop.id)}/gallery/${id}`, {
        method: 'DELETE',
      })
      await ws.reload()
    } catch {
      setFailed(true)
    }
  }

  /** The first photo is the cover customers see; this moves a photo to the front. */
  async function makeCover(id: string) {
    if (!shop) return
    try {
      await ws.api(`/businesses/${encodeURIComponent(shop.id)}/gallery/${id}/cover`, {
        method: 'POST',
      })
      await ws.reload()
    } catch {
      setFailed(true)
    }
  }

  /** Put a photo in another group (shop front, inside, menu, products, other). */
  async function moveTo(id: string, kind: GalleryKind) {
    if (!shop) return
    try {
      await ws.api(`/businesses/${encodeURIComponent(shop.id)}/gallery/${id}/kind`, {
        method: 'POST',
        body: JSON.stringify({ kind }),
        headers: { 'Content-Type': 'application/json' },
      })
      await ws.reload()
    } catch {
      setFailed(true)
    }
  }

  return {
    ids,
    kinds,
    urls,
    busy,
    failed,
    add,
    remove,
    makeCover,
    moveTo,
    full: ids.length >= GALLERY_LIMIT,
  }
}
