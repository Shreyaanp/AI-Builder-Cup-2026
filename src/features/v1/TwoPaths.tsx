import { useRef, useState } from 'react'
import { Box, Button, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material'
import { Search } from 'lucide-react'
import { isLanguagePref, LOCALE_NAMES, LOCALES, systemLocale } from '../../i18n/locales'
import { shopZone } from '../../region/region'
import { usePreferences, usePreferencesDispatch } from '../../state/hooks'
import { useSourcingCopy } from '../sourcing/copy'
import type { Proposal } from './api'
import { useCopy } from './strings'
import { useTwoPathsCopy } from './twoPathsCopy'
import { useWorkspace } from './workspaceContext'

/**
 * Screen entries for features that were chat-only (simplify batch 2): every feature has a
 * button path and a chat path. Each prepares the same change the coach would, and nothing is
 * saved until the owner confirms the review.
 */

/** The shop's own calendar day (YYYY-MM-DD), the date "closed today" is stored for. */
function shopToday(zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Shop details: close for today only (the coach's set_open_today), reviewed before saving. */
export function ClosedTodaySwitch({ onReview }: { onReview: () => void }) {
  const c = useTwoPathsCopy()
  const t = useCopy()
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const shop = ws.active
  if (!shop) return null
  const today = shopToday(shopZone(shop.fields))
  const closed = shop.fields.closed_on === today
  async function change(close: boolean) {
    if (busy || !shop) return
    setBusy(true)
    try {
      const proposal = await ws.api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'business',
          business_id: shop.id,
          revision: shop.revision,
          business: { ...shop.fields, closed_on: close ? today : '' },
        }),
      })
      onReview()
      ws.review(proposal)
    } catch {
      ws.notify(ws.readOnlyMessage ?? t.actionFailed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 2, minHeight: 56 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyLarge">{c.closedToday}</Typography>
        <Typography variant="bodyMedium" color="text.secondary">
          {c.closedTodayHint}
        </Typography>
      </Box>
      <Switch
        checked={closed}
        onChange={(_, checked) => void change(checked)}
        slotProps={{ input: { 'aria-label': c.closedToday } }}
      />
    </Stack>
  )
}

/** Messages: the language the app and coach use (the coach's set_reply_language). */
export function ReplyLanguage() {
  const c = useTwoPathsCopy()
  const t = useCopy()
  const preferences = usePreferences()
  const dispatch = usePreferencesDispatch()
  return (
    <TextField
      select
      fullWidth
      label={c.replyLanguage}
      helperText={c.replyLanguageHint}
      value={preferences.language}
      onChange={(event) =>
        isLanguagePref(event.target.value) &&
        dispatch({ type: 'language', language: event.target.value })
      }
      sx={{ mt: 6 }}
    >
      <MenuItem value="system">
        {t.languageSystem} ({LOCALE_NAMES[systemLocale()]})
      </MenuItem>
      {LOCALES.map((code) => (
        <MenuItem key={code} value={code} lang={code}>
          {LOCALE_NAMES[code]}
        </MenuItem>
      ))}
    </TextField>
  )
}

/** Orders: always a way to start a supplier search from the screen (the coach finds them). */
export function FindSupplier({ onStart }: { onStart: () => void }) {
  const c = useTwoPathsCopy()
  const s = useSourcingCopy()
  const ws = useWorkspace()
  const [item, setItem] = useState('')
  const field = useRef<HTMLInputElement>(null)
  return (
    <Stack
      component="form"
      noValidate
      spacing={2}
      sx={{ mb: 4 }}
      onSubmit={(event) => {
        event.preventDefault()
        const name = item.trim()
        if (!name) {
          field.current?.focus()
          return
        }
        onStart()
        ws.startCoachDraft(s.lowMessage(name.toLowerCase()), { send: true })
      }}
    >
      <TextField
        inputRef={field}
        label={c.supplierNeed}
        name="supply-item"
        value={item}
        onChange={(event) => setItem(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 80 } }}
      />
      <Button
        type="submit"
        variant="outlined"
        startIcon={<Search size={18} />}
        sx={{ alignSelf: 'flex-start', minHeight: 48 }}
      >
        {c.findSupplier}
      </Button>
    </Stack>
  )
}
