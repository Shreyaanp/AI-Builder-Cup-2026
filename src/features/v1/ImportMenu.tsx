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
import { formatPrice, shopCurrency, toMinor } from './format'
import { Sheet } from './Sheet'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { IMPORT_ACCEPT, type Importer, type SalesImport } from './useImport'
import { useShopCopy } from '../shop/strings'

/** The menu sheet's compact "Import" action; its choices open in the sheet body. */
export function ImportButton({
  expanded,
  busy,
  onToggle,
}: {
  expanded: boolean
  busy: boolean
  onToggle: () => void
}) {
  const t = useCopy()
  const shop = useShopCopy()
  return (
    <Button
      variant="outlined"
      // The short label keeps both sheet buttons on one row; the name still says what it reads.
      aria-label={t.importMenu}
      startIcon={busy ? <CircularProgress size={18} /> : <FileSpreadsheet size={18} />}
      disabled={busy}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls="import-panel"
    >
      {shop.importShort}
    </Button>
  )
}

/**
 * Import a menu or sales export from any POS or spreadsheet, a photo, or pasted notes. AI maps
 * it on the server; menu and sales imports wait for the owner's exact confirmation.
 */
export function ImportPanel({ importer }: { importer: Importer }) {
  const t = useCopy()
  const input = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [notes, setNotes] = useState('')
  const { busy, failed } = importer
  const upload = (file: File) => {
    void importer.upload(file).finally(() => {
      if (input.current) input.current.value = ''
      if (camera.current) camera.current.value = ''
    })
  }
  return (
    <Stack id="import-panel" spacing={2} sx={{ width: '100%', minWidth: 0, mb: 4 }}>
      <input
        ref={input}
        type="file"
        accept={IMPORT_ACCEPT}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) upload(file)
        }}
      />
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
          if (file) upload(file)
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
            upload(new File([notes], 'notes.txt', { type: 'text/plain' }))
          }
        }}
      />
      {failed && <Alert severity="error">{failed}</Alert>}
      <Button
        disabled={busy}
        onClick={() => upload(new File([notes], 'notes.txt', { type: 'text/plain' }))}
        startIcon={busy ? <CircularProgress size={18} /> : undefined}
        sx={{ minHeight: 48, alignSelf: 'flex-start' }}
      >
        {t.importReviewNotes}
      </Button>
    </Stack>
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
