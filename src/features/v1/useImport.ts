import { useRef, useState } from 'react'
import type { Proposal } from './api'
import { ApiError } from './api'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'

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
  sales: { date: string; item: string; quantity: number; revenue: number }[]
}

type ImportResult =
  | { kind: 'menu'; proposal: Proposal; items: number; skipped: number; flags?: ImportFlag[] }
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
      const result = await ws.api<ImportResult>(
        `/businesses/${encodeURIComponent(shop.id)}/import`,
        {
          method: 'POST',
          body: file,
          headers: { 'Content-Type': file.type || 'text/csv' },
        },
      )
      onBeforeReview?.()
      if (result.kind === 'menu') ws.review({ ...result.proposal, import_flags: result.flags })
      else onSales(result)
    } catch (cause) {
      const message =
        cause instanceof ApiError && cause.code === 'EXTRACTION_UNAVAILABLE'
          ? t.importUnavailable
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
