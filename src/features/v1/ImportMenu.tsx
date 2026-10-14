import { useRef, useState } from 'react'
import { Box, Button, List, ListItem, ListItemText, Typography } from '@mui/material'
import { FileSpreadsheet } from 'lucide-react'
import type { Proposal } from './api'
import { formatPrice, shopCurrency, toMinor } from './format'
import { Sheet } from './Sheet'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'

const ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

interface SalesSummary {
  rows: number
  items: number
  days: number
  first_day: string | null
  last_day: string | null
  total_revenue: number
  top_items: { name: string; quantity: number; revenue: number }[]
}

type ImportResult =
  | { kind: 'menu'; proposal: Proposal; items: number; skipped: number }
  | { kind: 'sales'; summary: SalesSummary }

/**
 * Import a menu or sales export from any POS or spreadsheet. AI maps the columns on the server;
 * a menu comes back as a sealed proposal for review, sales as a summary that is not saved.
 */
export function ImportMenu({ onBeforeReview }: { onBeforeReview?: () => void }) {
  const t = useCopy()
  const ws = useWorkspace()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [sales, setSales] = useState<SalesSummary | null>(null)
  const shop = ws.active
  if (!shop) return null
  const currency = shopCurrency(shop)

  async function upload(file: File) {
    if (busy || !shop) return
    setBusy(true)
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
        ws.review(result.proposal)
      } else {
        setSales(result.summary)
      }
    } catch {
      ws.notify(t.importFailed)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
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
        startIcon={<FileSpreadsheet size={18} />}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? t.importing : t.importMenu}
      </Button>
      <Sheet
        open={sales !== null}
        onClose={() => setSales(null)}
        titleId="sales-summary-title"
        title={t.salesSummary}
      >
        {sales && (
          <Box>
            <Typography variant="bodyMedium" color="text.secondary">
              {t.salesNotSaved}
            </Typography>
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
          </Box>
        )}
      </Sheet>
    </>
  )
}
