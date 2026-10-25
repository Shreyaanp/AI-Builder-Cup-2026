import { useRef, useState } from 'react'
import type { Proposal } from './api'
import { ApiError } from './api'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { preparePhoto } from './photoPrep'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** Longer than the server's own limits (upload, then a read with one retry). */
const IMPORT_TIMEOUT_MS = 240_000

/** Menu or sales documents the import endpoint reads (spreadsheets, PDFs, notes, photos). */
export const IMPORT_ACCEPT =
  '.csv,.xlsx,.pdf,.txt,image/jpeg,image/png,image/webp,text/plain,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** The coach's "Document" choice: spreadsheets and PDFs (photos have their own choices). */
export const DOCUMENT_ACCEPT =
  '.csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

interface ImportFlag {
  row: number
  item: string
  reasons: string[]
}

export interface SalesSummary {
  rows: number
  items: number
  days: number
  first_day: string | null
  last_day: string | null
  total_revenue: number
  top_items: { name: string; quantity: number; revenue: number }[]
}

export interface SalesImport {
  flags?: ImportFlag[]
  kind: 'sales'
  summary: SalesSummary
  import_id: string
  digest: string
  currency: string
  currency_mismatches?: number
  status?: 'needs_review' | 'nothing_to_propose'
  source_label?: string
  sales: { date: string; item: string; quantity: number; revenue: number }[]
}

type ImportResult =
  | {
      kind: 'menu'
      proposal: Proposal
      items: number
      skipped: number
      flags?: ImportFlag[]
      /** The public demo's fixed sample read (O-1): the review says so. */
      sample_note?: string
    }
  | SalesImport

/**
 * Send a menu or sales document to `POST /businesses/{bid}/import`. AI maps it on the server;
 * a menu opens the review, sales open their summary. Nothing is saved without confirmation.
 */
export function useImport({
  onBeforeReview,
  onSales,
}: {
  onBeforeReview?: () => void
  onSales: (sales: SalesImport) => void
}) {
  const t = useCopy()
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  // The last document, so a failed read can be retried without picking it again.
  const last = useRef<File | null>(null)

  async function upload(file: File) {
    const shop = ws.active
    if (busy || !shop) return
    last.current = file
    setBusy(true)
    setFailed('')
    try {
      // OB-194: a phone original is megabytes on mobile data; only a shrunk copy is sent.
      const sent = PHOTO_TYPES.includes(file.type) ? (await preparePhoto(file)).file : file
      const result = await ws.api<ImportResult>(
        `/businesses/${encodeURIComponent(shop.id)}/import`,
        {
          method: 'POST',
          body: sent,
          headers: { 'Content-Type': sent.type || 'text/csv' },
          // OB-194: reading a menu photo or PDF takes 25-40 s in production; the default 25 s
          // wait gave up first, so a real menu import "failed" while the server was reading it.
          signal: AbortSignal.timeout(IMPORT_TIMEOUT_MS),
        },
      )
      onBeforeReview?.()
      if (result.kind === 'menu')
        ws.review({
          ...result.proposal,
          import_flags: result.flags,
          ...(result.sample_note ? { photo_notes: [result.sample_note] } : {}),
        })
      else onSales(result)
    } catch (cause) {
      const message =
        cause instanceof ApiError && cause.code === 'EXTRACTION_UNAVAILABLE'
          ? t.importUnavailable
          : cause instanceof ApiError && cause.status === 413
            ? t.importTooLarge
            : t.importFailed
      setFailed(message)
      ws.notify(message)
    } finally {
      setBusy(false)
    }
  }
  const retry = () => {
    if (last.current) void upload(last.current)
  }
  return { busy, failed, upload, retry }
}
export type Importer = ReturnType<typeof useImport>
