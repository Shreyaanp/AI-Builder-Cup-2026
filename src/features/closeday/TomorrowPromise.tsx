import { useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { NotebookPen } from 'lucide-react'
import { shape } from '../../design/theme'
import { productName } from '../../i18n/productNames'
import { useLocale } from '../../state/hooks'
import { AskHint } from '../v1/AskHint'
import { promiseCopyFor } from '../v1/today/promiseCopy'
import { useToday } from '../v1/today/useToday'
import { useWorkspace } from '../v1/workspaceContext'

const MAX_TEXT = 80

/**
 * The close screen's "Tomorrow" (HABIT change 4): one thing written down tonight that leads
 * Coach the next morning. The owner chooses it: the stock that runs out first is offered as one
 * tap, or they type their own. Optional, one a day; the server keeps only the latest.
 */
export function TomorrowPromise() {
  const ws = useWorkspace()
  const locale = useLocale()
  const pc = promiseCopyFor(locale)
  const roles = useTheme().material
  const facts = useToday()
  const [text, setText] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Only stock the shop said it buys or makes: an unknown item is never offered as an order.
  const low = facts?.low_stock.find((item) => item.source === 'bought' || item.source === 'made')
  const shop = ws.active
  if (!shop) return null

  async function save(body: { text: string; kind: 'order' | 'make' | 'note'; item?: string }) {
    setBusy(true)
    setFailed(false)
    try {
      await ws.api(`/businesses/${encodeURIComponent(shop!.id)}/promise`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setSaved(body.text)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (saved)
    return (
      <Stack
        direction="row"
        role="status"
        data-testid="close-tomorrow-saved"
        sx={{ mt: 4, gap: 2, alignItems: 'flex-start', textAlign: 'start' }}
      >
        <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary, pt: 0.5 }}>
          <NotebookPen size={20} />
        </Box>
        <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
          {pc.saved(saved)}
        </Typography>
      </Stack>
    )

  const name = low ? productName(low.name, locale) : ''
  const suggestion = low
    ? low.source === 'made'
      ? { label: pc.suggestMake(name), text: pc.makeThing(name), kind: 'make' as const }
      : { label: pc.suggestOrder(name), text: pc.orderThing(name), kind: 'order' as const }
    : null
  return (
    <Box
      component="section"
      aria-labelledby="close-tomorrow"
      data-testid="close-tomorrow"
      sx={{
        mt: 4,
        p: 3,
        width: '100%',
        textAlign: 'start',
        borderRadius: `${shape.lg}px`,
        border: `1px solid ${roles.outlineVariant}`,
      }}
    >
      <Typography id="close-tomorrow" component="h3" variant="titleMedium">
        {pc.tomorrow}
      </Typography>
      {suggestion && low && (
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() =>
            void save({ text: suggestion.text, kind: suggestion.kind, item: low.name })
          }
          sx={{ mt: 2, minHeight: 48, textAlign: 'start', justifyContent: 'flex-start' }}
        >
          {suggestion.label}
        </Button>
      )}
      <Stack
        component="form"
        direction="row"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim()) void save({ text: text.trim(), kind: 'note' })
        }}
        sx={{ mt: 2, gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}
      >
        <TextField
          label={pc.field}
          value={text}
          onChange={(event) => setText(event.target.value)}
          slotProps={{ htmlInput: { maxLength: MAX_TEXT, name: 'promise' } }}
          sx={{ flex: '1 1 180px' }}
        />
        <Button
          type="submit"
          variant="outlined"
          disabled={busy || !text.trim()}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 56 }}
        >
          {pc.save}
        </Button>
      </Stack>
      {failed && (
        <Typography role="alert" variant="bodyMedium" sx={{ mt: 2, color: roles.error }}>
          {pc.failed}
        </Typography>
      )}
      <AskHint id="promise" />
    </Box>
  )
}
