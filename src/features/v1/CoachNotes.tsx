import { useState } from 'react'
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material'
import { Trash2 } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import type { Business } from './api'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'

/**
 * Note copy. Kept in its own module (like the coach's buttons) so other locales fall back to
 * English instead of breaking the build; add a locale below.
 */
const en = {
  add: 'Add a note for the coach',
  hint: 'For example: supplier comes on Tuesdays',
  save: 'Save note',
  saved: 'Saved. The coach knows it now.',
  already: 'The coach already has this note.',
}
type NoteCopy = typeof en
const hi: NoteCopy = {
  add: 'कोच के लिए नोट लिखें',
  hint: 'जैसे: सप्लायर मंगलवार को आता है',
  save: 'नोट सेव करें',
  saved: 'सेव हो गया। कोच को अब पता है।',
  already: 'यह नोट कोच के पास पहले से है।',
}
const COPY: Record<string, NoteCopy> = { en, hi }

/**
 * What the coach remembers, in My shop → Shop details: the same list whether the owner told the
 * coach ("remember that…") or typed it here, with one rule for both (POST /notes). Works with
 * the coach and voice off: nothing here waits on the AI.
 */
export function CoachNotes({ shop }: { shop: Business }) {
  const t = useCopy()
  const locale = useLocale()
  const c = COPY[locale.split('-')[0] ?? 'en'] ?? en
  const ws = useWorkspace()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const notes = shop.coach_notes ?? []
  const base = `/businesses/${encodeURIComponent(shop.id)}/notes`

  async function save() {
    const note = text.trim()
    if (!note || busy) return
    setBusy(true)
    try {
      const saved = await ws.api<{ status: string }>(base, {
        method: 'POST',
        body: JSON.stringify({ text: note }),
      })
      setText('')
      await ws.reload()
      ws.notify(saved.status === 'already_remembered' ? c.already : c.saved)
    } catch {
      ws.notify(t.actionFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box component="section" aria-labelledby="coach-memory-title" sx={{ mt: 4 }}>
      <Typography
        id="coach-memory-title"
        component="h3"
        variant="titleSmall"
        color="text.secondary"
      >
        {t.coachMemory}
      </Typography>
      {notes.length > 0 && (
        <List disablePadding>
          {notes.map((note) => (
            <ListItem
              key={note.id}
              disableGutters
              divider
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label={`${t.forgetNote}: ${note.text}`}
                  onClick={() =>
                    void ws
                      .api(`${base}/${encodeURIComponent(note.id)}`, { method: 'DELETE' })
                      .then(() => ws.reload())
                      .catch(() => ws.notify(t.actionFailed))
                  }
                >
                  <Trash2 size={18} />
                </IconButton>
              }
            >
              <ListItemText primary={note.text} sx={{ pr: 6 }} />
            </ListItem>
          ))}
        </List>
      )}
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
        sx={{ display: 'grid', gap: 2, mt: 2 }}
      >
        <TextField
          label={c.add}
          placeholder={c.hint}
          value={text}
          onChange={(event) => setText(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200, name: 'coach-note', autoComplete: 'off' } }}
          fullWidth
        />
        <Button
          type="submit"
          variant="outlined"
          disabled={!text.trim() || busy}
          sx={{ justifySelf: 'start', minHeight: 48 }}
        >
          {c.save}
        </Button>
      </Box>
    </Box>
  )
}
