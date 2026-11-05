import { useRef, useState } from 'react'
import { Alert, Box, Button, Chip, Stack, TextField, Typography, useTheme } from '@mui/material'
import { Check } from 'lucide-react'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { PlainText } from '../../design/PlainText'
import { RichText } from '../../design/LazyRichText'
import { chatBubbleStyle } from '../coach/bubbleStyle'
import { fill, useOwnerCopy } from '../owner/copy'
import { useRescueCopy } from '../rescue/copy'
import { rescueMarker } from '../rescue/marker'
import { formatMoneyText } from './formatMoneyText'
import { messageLanguage } from './messageLanguage'
import { messageTime } from './messageTime'

import type { ConversationCopy, Thread, Translation } from './conversationCopy'

/** The owner's extras (OB-303): one-tap reply drafts, ✓ Sent and times in the shop's timezone. */
export type OwnerReplies = {
  suggestions: string[]
  timeZone: string
  copy: { suggested: string; sent: string }
}

export function ConversationView({
  thread,
  viewer,
  copy: t,
  onSend,
  onTranslate,
  owner,
}: {
  thread: Thread
  viewer: 'customer' | 'owner'
  copy: ConversationCopy
  onSend: (text: string) => Promise<void>
  onTranslate: (id: string) => Promise<Translation>
  owner?: OwnerReplies
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const messages = thread.messages ?? []
  const last = messages.at(-1)
  // The owner's own latest words are stored on the server, so they are truly sent. Delivered
  // and read are not known for every customer, so they are never shown.
  const sentId = owner && last?.author === viewer && !last.kind ? last.id : null
  const waiting = messages.filter((message) => message.kind !== 'ai').at(-1)?.author !== viewer
  const drafts = owner && waiting && !thread.done && !thread.blocked ? owner.suggestions : []
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
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              viewer={viewer}
              copy={t}
              onTranslate={onTranslate}
              timeZone={owner?.timeZone}
              sent={message.id === sentId ? owner?.copy.sent : undefined}
            />
          ))}
        </Stack>
      </Box>
      {drafts.length > 0 && (
        // A tap only fills the reply box; the owner reads, edits and sends (OB-303).
        <Box role="group" aria-labelledby="suggested-replies">
          <Typography id="suggested-replies" variant="labelLarge" component="p" sx={{ mb: 1 }}>
            {owner?.copy.suggested}
          </Typography>
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            {drafts.map((text) => (
              <Chip
                key={text}
                label={text}
                variant="outlined"
                onClick={() => {
                  setDraft(text)
                  setError('')
                  requestAnimationFrame(() => {
                    const field = input.current
                    field?.focus()
                    field?.setSelectionRange(field.value.length, field.value.length)
                  })
                }}
                sx={{
                  height: 'auto',
                  minHeight: 40,
                  maxWidth: '100%',
                  py: 1,
                  borderRadius: 2,
                  justifyContent: 'flex-start',
                  textAlign: 'start',
                  '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere' },
                }}
              />
            ))}
          </Stack>
        </Box>
      )}
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
  timeZone,
  sent,
}: {
  message: components['schemas']['ThreadMessage']
  viewer: 'customer' | 'owner'
  copy: ConversationCopy
  onTranslate: (id: string) => Promise<Translation>
  timeZone?: string
  sent?: string
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
  const displayed = visible ? translation.text : text
  const generated = message.kind === 'ai' || message.kind === 'demo'
  // The owner is offered a translation only of a customer's words in another language (OB-303).
  const translatable = viewer !== 'owner' || (!mine && messageLanguage(text) !== locale)
  return (
    <Box component="li" sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <Box
        sx={{ ...chatBubbleStyle(roles), ...(mine ? {} : { bgcolor: roles.surfaceContainerLow }) }}
      >
        <Typography variant="labelMedium">
          {message.kind === 'ai'
            ? t.aiAnswer
            : mine
              ? t.you
              : message.author === 'owner'
                ? t.shop
                : t.customer}
        </Typography>
        {visible || generated ? (
          <RichText content={generated ? formatMoneyText(displayed, locale) : displayed} />
        ) : (
          <PlainText text={text} />
        )}
        <Typography variant="bodySmall" color="text.secondary">
          {timeZone
            ? messageTime(message.created, dateLocale, timeZone)
            : new Intl.DateTimeFormat(dateLocale, {
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(message.created * 1000))}
        </Typography>
        {sent && (
          <Typography
            variant="labelMedium"
            color="text.secondary"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}
          >
            <Check size={16} aria-hidden="true" />
            {sent}
          </Typography>
        )}
        {visible && (
          <Typography variant="bodySmall">
            {translation.mode === 'fixture' ? t.fixture : t.ai}
          </Typography>
        )}
        {translatable && (
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
        )}
        {error && <Alert severity="error">{t.chatFailed}</Alert>}
      </Box>
    </Box>
  )
}
