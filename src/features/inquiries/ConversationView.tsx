import { useRef, useState } from 'react'
import { Alert, Box, Button, Stack, TextField, Typography, useTheme } from '@mui/material'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { chatBubbleStyle } from '../coach/bubbleStyle'
import { fill, useOwnerCopy } from '../owner/copy'
import { useRescueCopy } from '../rescue/copy'
import { rescueMarker } from '../rescue/marker'

import type { ConversationCopy, Thread, Translation } from './conversationCopy'

export function ConversationView({
  thread,
  viewer,
  copy: t,
  onSend,
  onTranslate,
}: {
  thread: Thread
  viewer: 'customer' | 'owner'
  copy: ConversationCopy
  onSend: (text: string) => Promise<void>
  onTranslate: (id: string) => Promise<Translation>
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const submit = async () => {
    if (busy) return
    if (!draft.trim() || Array.from(draft.trim()).length > 500) {
      setError(t.invalid)
      input.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSend(draft.trim())
      setDraft('')
    } catch {
      setError(t.chatFailed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack spacing={2}>
      {/* The log role sits on a wrapper: on the <ol> itself it replaced the list role and left
          every message an <li> outside any list (axe "listitem"). */}
      <Box role="log" aria-label={t.conversation} aria-live="polite">
        <Stack component="ol" spacing={2} sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {(thread.messages ?? []).map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              viewer={viewer}
              copy={t}
              onTranslate={onTranslate}
            />
          ))}
        </Stack>
      </Box>
      {thread.done || thread.blocked ? (
        <Typography role="status" variant="bodyMedium">
          {thread.blocked ? t.blocked : t.closed}
        </Typography>
      ) : (
        <Stack
          component="form"
          spacing={2}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <TextField
            label={t.reply}
            name="reply"
            autoComplete="off"
            multiline
            minRows={2}
            fullWidth
            inputRef={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            error={error === t.invalid}
            helperText={error === t.invalid ? error : `${Array.from(draft).length}/500`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t.send}
          </Button>
        </Stack>
      )}
      {error && error !== t.invalid && <Alert severity="error">{error}</Alert>}
    </Stack>
  )
}

function MessageBubble({
  message,
  viewer,
  copy: t,
  onTranslate,
}: {
  message: components['schemas']['ThreadMessage']
  viewer: 'customer' | 'owner'
  copy: ConversationCopy
  onTranslate: (id: string) => Promise<Translation>
}) {
  const roles = useTheme().material
  const locale = useLocale()
  const dateLocale = navigator.language.split('-')[0] === locale ? navigator.language : locale
  const [translation, setTranslation] = useState<Translation | null>(null)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const mine = message.author === viewer
  const owner = useOwnerCopy()
  const customer = useRescueCopy()
  const hold = rescueMarker(message.text)
  const text = hold
    ? fill(viewer === 'owner' ? owner.holdRequest : customer.holdRequest, {
        n: hold.qty,
        item: hold.item,
      })
    : message.text
  // A changed viewer language requires a fresh, explicit translation request.
  const [translatedLocale, setTranslatedLocale] = useState(locale)
  const visible = show && translatedLocale === locale && translation
  return (
    <Box component="li" sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <Box
        sx={{ ...chatBubbleStyle(roles), ...(mine ? {} : { bgcolor: roles.surfaceContainerLow }) }}
      >
        <Typography variant="labelMedium">
          {mine ? t.you : message.author === 'owner' ? t.shop : t.customer}
        </Typography>
        <Typography variant="bodyLarge" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {visible ? translation.text : text}
        </Typography>
        <Typography variant="bodySmall" color="text.secondary">
          {new Intl.DateTimeFormat(dateLocale, { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(message.created * 1000),
          )}
        </Typography>
        {visible && (
          <Typography variant="bodySmall">
            {translation.mode === 'fixture' ? t.fixture : t.ai}
          </Typography>
        )}
        <Button
          disabled={busy}
          onClick={async () => {
            if (visible) {
              setShow(false)
              return
            }
            if (translation && translatedLocale === locale) {
              setShow(true)
              return
            }
            setBusy(true)
            setError(false)
            try {
              setTranslation(await onTranslate(message.id))
              setTranslatedLocale(locale)
              setShow(true)
            } catch {
              setError(true)
            } finally {
              setBusy(false)
            }
          }}
        >
          {visible ? t.original : t.translate}
        </Button>
        {error && <Alert severity="error">{t.chatFailed}</Alert>}
      </Box>
    </Box>
  )
}
