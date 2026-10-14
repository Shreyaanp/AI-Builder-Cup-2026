import { useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Typography,
  TextField,
  Stack,
} from '@mui/material'
import { Camera, FileSpreadsheet } from 'lucide-react'
import type { Proposal } from './api'
import { ApiError } from './api'
import { formatPrice, shopCurrency, toMinor } from './format'
import { Sheet } from './Sheet'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'

const ACCEPT =
  '.csv,.xlsx,.pdf,.txt,image/jpeg,image/png,image/webp,text/plain,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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
 * Import a menu or sales export from any POS or spreadsheet. AI maps the columns on the server;
 * Menu and sales imports wait for the owner's exact confirmation.
 */
export function ImportMenu({
  onBeforeReview,
  onSales,
}: {
  onBeforeReview?: () => void
  onSales: (sales: SalesImport) => void
}) {
  const t = useCopy()
  const ws = useWorkspace()
  const input = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [failed, setFailed] = useState('')
  const shop = ws.active
  if (!shop) return null

  async function upload(file: File) {
    if (busy || !shop) return
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
      if (result.kind === 'menu') {
        onBeforeReview?.()
        ws.review({ ...result.proposal, import_flags: result.flags })
      } else {
        onBeforeReview?.()
        onSales(result)
      }
    } catch (cause) {
      const message =
        cause instanceof ApiError && cause.code === 'EXTRACTION_UNAVAILABLE'
          ? t.importUnavailable
          : t.importFailed
      setFailed(message)
      ws.notify(message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
      if (camera.current) camera.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />
      <Button
        variant="outlined"
        startIcon={busy ? <CircularProgress size={18} /> : <FileSpreadsheet size={18} />}
        disabled={busy}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        sx={{ minHeight: 48 }}
      >
        {t.importMenu}
      </Button>
      {expanded && (
        <Stack spacing={2} sx={{ width: '100%', minWidth: 0 }}>
          <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
            <Button disabled={busy} onClick={() => input.current?.click()} sx={{ minHeight: 48 }}>
              {t.importUpload}
            </Button>
            <Button
              disabled={busy}
              startIcon={<Camera size={18} />}
              onClick={() => camera.current?.click()}
              sx={{ minHeight: 48, display: { xs: 'inline-flex', md: 'none' } }}
            >
              {t.importTakePhoto}
            </Button>
          </Stack>
          <input
            ref={camera}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <TextField
            name="import-notes"
            label={t.importNotes}
            multiline
            minRows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void upload(new File([notes], 'notes.txt', { type: 'text/plain' }))
              }
            }}
          />
          {failed && <Alert severity="error">{failed}</Alert>}
          <Button
            disabled={busy}
            onClick={() => void upload(new File([notes], 'notes.txt', { type: 'text/plain' }))}
            startIcon={busy ? <CircularProgress size={18} /> : undefined}
            sx={{ minHeight: 48 }}
          >
            {t.importReviewNotes}
          </Button>
        </Stack>
      )}
    </>
  )
}

export function SalesImportSheet({
  imported,
  onClose,
}: {
  imported: SalesImport | null
  onClose: () => void
}) {
  const ws = useWorkspace()
  const t = useCopy()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sales = imported?.summary
  const currency = imported?.currency ?? shopCurrency(ws.active)
  async function save() {
    if (!imported || !ws.active || busy) return
    setBusy(true)
    setFailed(false)
    try {
      await ws.api(
        `/businesses/${encodeURIComponent(ws.active.id)}/import/${imported.import_id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ digest: imported.digest }),
        },
      )
      await ws.reload()
      ws.notify(t.salesSaved)
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open={imported !== null}
      onClose={() => {
        if (!busy) onClose()
      }}
      titleId="sales-summary-title"
      title={t.salesSummary}
    >
      {sales && (
        <Box>
          <Typography variant="bodyMedium" color="text.secondary">
            {t.salesNotSaved}
          </Typography>
          <Typography variant="bodyMedium" sx={{ mt: 2 }}>
            {t.salesReplace}
          </Typography>
          {failed && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {t.importFailed}
            </Alert>
          )}
          {Boolean(imported?.flags?.length) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t.importReviewFlags}:{' '}
              {imported?.flags?.map((flag) => `${flag.row}: ${flag.item}`).join(', ')}
            </Alert>
          )}
          <Typography variant="headlineSmall" sx={{ mt: 3 }}>
            {formatPrice(toMinor(sales.total_revenue, currency), currency)}
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            {t.salesRange(sales.days, sales.first_day ?? '', sales.last_day ?? '')}
          </Typography>
          <Typography component="h3" variant="titleSmall" sx={{ mt: 4 }}>
            {t.topItems}
          </Typography>
          <List disablePadding>
            {sales.top_items.map((item) => (
              <ListItem key={item.name} disableGutters divider>
                <ListItemText
                  primary={item.name}
                  secondary={`${item.quantity} · ${formatPrice(toMinor(item.revenue, currency), currency)}`}
                />
              </ListItem>
            ))}
          </List>
          <Typography component="h3" variant="titleSmall" sx={{ mt: 3 }}>
            {t.salesDaily}
          </Typography>
          <List disablePadding sx={{ maxHeight: 240, overflowY: 'auto' }}>
            {imported?.sales.map((row) => (
              <ListItem key={`${row.date}-${row.item}`} disableGutters divider>
                <ListItemText
                  primary={`${row.date} · ${row.item}`}
                  secondary={`${row.quantity} · ${formatPrice(row.revenue, currency)}`}
                />
              </ListItem>
            ))}
          </List>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => void save()}
            sx={{ mt: 3, minHeight: 48 }}
            startIcon={busy ? <CircularProgress size={18} /> : undefined}
          >
            {t.saveSales}
          </Button>
        </Box>
      )}
    </Sheet>
  )
}
