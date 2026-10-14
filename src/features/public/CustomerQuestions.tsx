import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import type { components } from '../../api/generated'
import { useLocale } from '../../state/hooks'
import { shape } from '../../design/theme'
import { formatPrice } from '../v1/format'

import type { CustomerCopy } from './customerCopy'

type Answer = components['schemas']['Answer']

async function send<T>(id: string, action: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(`/api/v1/public/shops/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
  })
  if (!response.ok) throw new Error(String(response.status))
  return response.json() as Promise<T>
}

function errorCopy(error: unknown, t: CustomerCopy) {
  const status = error instanceof Error ? error.message : ''
  return status === '429'
    ? t.rateLimited
    : status === '404'
      ? t.shopUnavailable
      : status === '409'
        ? t.factsChanged
        : t.requestFailed
}

export function CustomerQuestions({
  id,
  facts,
  item,
  currency,
  copy: t,
}: {
  id: string
  facts: string
  item?: string
  currency: string
  copy: CustomerCopy
}) {
  const locale = useLocale()
  const roles = useTheme().material
  const [question, setQuestion] = useState('')
  const [result, setAnswer] = useState<{ answer: Answer; facts: string } | null>(null)
  const answer = result?.facts === facts ? result.answer : null
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  const submit = async () => {
    if (busy) return
    if (!question.trim() || question.trim().length > 500) {
      setInvalid(true)
      input.current?.focus()
      return
    }
    setInvalid(false)
    setBusy(true)
    setError('')
    setAnswer(null)
    const abort = new AbortController()
    request.current = abort
    try {
      const result = await send<Answer>(
        id,
        'ask',
        { question: question.trim(), language: locale },
        abort.signal,
      )
      if (!abort.signal.aborted) setAnswer({ answer: result, facts })
    } catch (failure) {
      if (!abort.signal.aborted) setError(errorCopy(failure, t))
    } finally {
      if (!abort.signal.aborted) setBusy(false)
    }
  }

  const suggestions: [string, string][] = [
    ...(item
      ? [[t.priceSuggestion, t.priceQuestion.replace('{item}', item)] as [string, string]]
      : []),
    [t.hoursSuggestion, t.hoursQuestion],
    [t.locationSuggestion, t.locationQuestion],
  ]

  return (
    <Box component="section" aria-labelledby="ask-title" sx={{ mt: 4 }}>
      <Typography id="ask-title" component="h2" variant="titleLarge" sx={{ mb: 2 }}>
        {t.askTitle}
      </Typography>
      <Stack
        component="form"
        noValidate
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <TextField
          label={t.question}
          name="question"
          autoComplete="off"
          placeholder={t.questionHint}
          inputRef={input}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          error={invalid}
          helperText={invalid ? t.questionInvalid : undefined}
          required
          fullWidth
        />
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          {suggestions.map(([label, value]) => (
            <Chip
              key={label}
              label={label}
              variant="outlined"
              disabled={busy}
              sx={{ minHeight: 48 }}
              onClick={() => {
                setQuestion(value)
                input.current?.focus()
              }}
            />
          ))}
        </Stack>
        <Button
          type="submit"
          variant="contained"
          disabled={busy}
          sx={{ alignSelf: 'flex-start' }}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {t.sendQuestion}
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      <Box role="status" aria-live="polite">
        {answer && (
          <Box
            sx={{ mt: 2, p: 2, bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.md}px` }}
          >
            <Typography
              variant="bodyLarge"
              sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
            >
              {answer.answer}
            </Typography>
            {answer.price != null && (
              <Typography variant="bodyLarge" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatPrice(answer.price, currency)} / {answer.unit}
              </Typography>
            )}
            <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
              {t.answerNote}
            </Typography>
            {answer.mode === 'fixture' && (
              <Typography variant="bodySmall" color="text.secondary">
                {t.offlineAnswer}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export function CustomerInquiry({ id, copy: t }: { id: string; copy: CustomerCopy }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState({ name: '', contact: '', message: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const contactInput = useRef<HTMLInputElement>(null)
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  const submit = async () => {
    if (busy) return
    const phone =
      /^\+?[\d ()-]+$/.test(contact.trim()) && /^[\d]{7,15}$/.test(contact.replace(/\D/g, ''))
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim())
    const next = {
      name: name.trim().length > 100 ? t.nameInvalid : '',
      contact: (!phone && !email) || contact.trim().length > 254 ? t.contactInvalid : '',
      message: !message.trim() || message.trim().length > 500 ? t.messageInvalid : '',
    }
    setErrors(next)
    if (next.name || next.contact || next.message) {
      ;(next.name ? nameInput : next.contact ? contactInput : messageInput).current?.focus()
      return
    }
    setBusy(true)
    setError('')
    setSent(false)
    const abort = new AbortController()
    request.current = abort
    try {
      await send<components['schemas']['InquiryReceipt']>(
        id,
        'inquiries',
        { name: name.trim(), contact: contact.trim(), message: message.trim() },
        abort.signal,
      )
      if (!abort.signal.aborted) {
        setSent(true)
        setName('')
        setContact('')
        setMessage('')
      }
    } catch (failure) {
      if (!abort.signal.aborted) setError(errorCopy(failure, t))
    } finally {
      if (!abort.signal.aborted) setBusy(false)
    }
  }

  return (
    <Box component="section" aria-labelledby="contact-title" sx={{ mt: 4 }}>
      <Typography id="contact-title" component="h2" variant="titleLarge">
        {t.contactTitle}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
        {t.contactHint}
      </Typography>
      <Stack
        component="form"
        noValidate
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <TextField
          label={t.customerName}
          name="name"
          autoComplete="name"
          inputRef={nameInput}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={!!errors.name}
          helperText={errors.name || undefined}
        />
        <TextField
          label={t.customerContact}
          name="contact"
          autoComplete="email"
          inputRef={contactInput}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          required
          error={!!errors.contact}
          helperText={errors.contact || t.customerContactHint}
        />
        <TextField
          label={t.customerMessage}
          name="message"
          autoComplete="off"
          inputRef={messageInput}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          multiline
          minRows={3}
          error={!!errors.message}
          helperText={errors.message || `${message.length}/500`}
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
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {t.sendMessage}
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      <Box role="status" aria-live="polite">
        {sent && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {t.sentPending}
          </Alert>
        )}
      </Box>
    </Box>
  )
}
