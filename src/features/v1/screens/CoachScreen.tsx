import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import {
  ArrowUp,
  Camera,
  Clock,
  History,
  Leaf,
  Mic,
  Plus,
  Square,
  Store,
  Tag,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { visuallyHidden } from '@mui/utils'
import { streamCoach } from '../../../api/stream'
import type { CoachEvent } from '../../../api/stream'
import { useIdentity } from '../../../auth/useIdentity'
import { useLocale } from '../../../state/hooks'
import { ApiError } from '../api'
import type { Conversation, PhotoResult, Proposal } from '../api'
import { useCopy } from '../strings'
import { NextAction } from '../NextAction'
import { useVoice } from '../useVoice'
import { useWorkspace } from '../workspaceContext'
import { shape } from '../../../design/theme'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
type Message = { role: 'user' | 'assistant'; text: string }

export function CoachScreen() {
  const t = useCopy()
  const theme = useTheme()
  const roles = theme.material
  const identity = useIdentity()
  const language = useLocale()
  const ws = useWorkspace()
  const [messages, setMessages] = useState<Message[]>([])
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'idle' | 'reply' | 'photo'>('idle')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'offline' | 'gemini' | null>(null)
  const [history, setHistory] = useState<Conversation[]>([])
  const [historyAnchor, setHistoryAnchor] = useState<HTMLElement | null>(null)
  const session = useRef<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const { api, activeId, review, setFaceOpen, go, speakReplies } = ws

  const receive = useCallback(
    (event: CoachEvent) => {
      if (event.kind === 'ready') {
        session.current = event.session_id ?? null
        setMode(event.mode ?? 'offline')
      }
      if (event.kind === 'delta') setReply((text) => text + (event.text ?? ''))
      if (event.kind === 'reply' || event.kind === 'output_transcript') setReply(event.text ?? '')
      if (event.kind === 'input_transcript')
        setMessages((items) => [...items, { role: 'user', text: event.text ?? '' }])
      if (event.kind === 'proposal') review(event.data as unknown as Proposal)
      if (event.kind === 'workflow' && event.data?.status === 'verification_required') {
        go('privacy')
        setFaceOpen(true)
      }
    },
    [review, go, setFaceOpen],
  )
  const voice = useVoice(activeId, receive)

  // Each shop has its own conversation thread.
  useEffect(() => {
    const abort = new AbortController()
    controller.current?.abort()
    session.current = null
    void api<Conversation[]>('/conversations', { signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted) setHistory(items)
      })
      .catch(() => undefined)
    return () => {
      abort.abort()
      speechSynthesis.cancel()
    }
  }, [api, activeId])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages, reply])
  // A pending request (e.g. "Start from a photo" on My shop) opens the picker once.
  const { photoPending, consumePhotoRequest } = ws
  useEffect(() => {
    if (photoPending) {
      consumePhotoRequest()
      photoInput.current?.click()
    }
  }, [photoPending, consumePhotoRequest])

  function resetThread() {
    controller.current?.abort()
    session.current = null
    setMessages([])
    setReply('')
    setError('')
  }

  async function send(text = note) {
    const message = text.trim()
    if (!message || busy !== 'idle' || voice.state !== 'idle') return
    const abort = new AbortController()
    controller.current = abort
    setBusy('reply')
    setReply('')
    setError('')
    setMessages((items) => [...items, { role: 'user' as const, text: message }].slice(-40))
    setNote('')
    let finalReply = ''
    try {
      const token = await identity.getToken()
      await streamCoach(
        { message, language, session_id: session.current, business_id: activeId },
        abort.signal,
        (event) => {
          receive(event)
          if (event.kind === 'delta') finalReply += event.text ?? ''
          if (event.kind === 'reply') finalReply = event.text ?? ''
        },
        token,
      )
      if (controller.current !== abort) return
      setMessages((items) =>
        [...items, { role: 'assistant' as const, text: finalReply }].slice(-40),
      )
      setReply('')
      if (speakReplies && finalReply) {
        speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(finalReply)
        utterance.lang = language
        speechSynthesis.speak(utterance)
      }
      const items = await api<Conversation[]>('/conversations')
      if (controller.current === abort) setHistory(items)
    } catch {
      if (!abort.signal.aborted) {
        setError(t.replyFailed)
        // Keep the unsent message available for a retry.
        setMessages((items) => items.slice(0, -1))
        setNote(message)
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setBusy('idle')
      }
    }
  }

  async function uploadPhoto(file: File) {
    if (busy !== 'idle') return
    setError('')
    if (!PHOTO_TYPES.includes(file.type) || file.size > 5_000_000) {
      setError(t.photoType)
      return
    }
    setBusy('photo')
    try {
      const query = activeId ? `?business_id=${encodeURIComponent(activeId)}` : ''
      const result = await api<PhotoResult>(`/photos${query}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type },
        signal: AbortSignal.timeout(60_000),
      })
      const notes = result.extraction.uncertain.slice(0, 3).join(' · ')
      setMessages((items) =>
        [
          ...items,
          {
            role: 'assistant' as const,
            text: result.proposal ? t.photoRead + (notes ? `\n${notes}` : '') : t.photoNothing,
          },
        ].slice(-40),
      )
      if (result.proposal) review(result.proposal)
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : ''
      setError(
        code === 'PHOTO_BLOCKED' || code === 'NOT_BUSINESS_PHOTO' ? t.photoRefused : t.photoFailed,
      )
    } finally {
      setBusy('idle')
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  async function restore(id: string) {
    setHistoryAnchor(null)
    try {
      const data = await api<{ messages: Message[] }>(`/conversations/${id}`)
      controller.current?.abort()
      session.current = id
      setMessages(data.messages)
      setReply('')
    } catch {
      setError(t.actionFailed)
    }
  }

  const shopHistory = history.filter((entry) => (entry.business_id ?? null) === activeId)
  const empty = messages.length === 0 && !reply
  type Suggestion = 'photo' | 'add' | 'price' | 'hours'
  const suggestions: { id: Suggestion; label: string; icon: ReactElement }[] = [
    { id: 'photo', label: t.suggestPhoto, icon: <Camera size={18} /> },
    ...(ws.active
      ? [
          { id: 'price' as const, label: t.suggestPrice, icon: <Tag size={18} /> },
          { id: 'hours' as const, label: t.suggestHours, icon: <Clock size={18} /> },
        ]
      : [{ id: 'add' as const, label: t.suggestAdd, icon: <Store size={18} /> }]),
  ]
  function suggest(id: Suggestion) {
    if (id === 'photo') photoInput.current?.click()
    else if (id === 'add') ws.openEditor({ kind: 'business', fields: null })
    else setNote((id === 'price' ? t.suggestPrice : t.suggestHours) + ': ')
  }
  const canSend = Boolean(note.trim()) && busy === 'idle' && voice.state === 'idle'

  return (
    <Box
      id="coach"
      component="section"
      aria-label={t.navCoach}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        maxWidth: 760,
        mx: 'auto',
      }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'flex-end', minHeight: 48 }}
      >
        {mode && (
          <Typography variant="labelMedium" color="text.secondary" sx={{ flex: 1 }}>
            {mode === 'gemini' ? t.geminiMode : t.offlineMode}
          </Typography>
        )}
        <Tooltip title={t.newChat}>
          <IconButton aria-label={t.newChat} onClick={resetThread} disabled={empty}>
            <Plus size={20} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t.history}>
          <span>
            <IconButton
              aria-label={t.history}
              disabled={shopHistory.length === 0}
              onClick={(event) => setHistoryAnchor(event.currentTarget)}
            >
              <History size={20} />
            </IconButton>
          </span>
        </Tooltip>
        <Menu
          anchorEl={historyAnchor}
          open={Boolean(historyAnchor)}
          onClose={() => setHistoryAnchor(null)}
        >
          {shopHistory.map((entry) => (
            <MenuItem key={entry.session_id} onClick={() => void restore(entry.session_id)}>
              <ListItemText
                primary={new Date(entry.updated * 1000).toLocaleString(language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              />
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      <Box sx={{ flex: 1, pb: 2 }}>
        {empty ? (
          <Stack spacing={3} sx={{ pt: { xs: 6, sm: 10 }, pb: 4 }}>
            <Typography component="h1" variant="headlineMedium">
              {ws.active ? t.coachGreetingShop(ws.active.fields.name) : t.coachGreeting}
            </Typography>
            <NextAction />
            <Typography variant="bodyMedium" color="text.secondary">
              {t.coachHint}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {suggestions.map((item) => (
                <Chip
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  variant="outlined"
                  onClick={() => suggest(item.id)}
                  sx={{
                    height: 40,
                    px: 1,
                    borderColor: roles.outlineVariant,
                    '& .MuiChip-icon': { color: roles.primary },
                  }}
                />
              ))}
            </Stack>
          </Stack>
        ) : (
          <Stack
            component="ol"
            role="log"
            aria-live="polite"
            spacing={3}
            sx={{ listStyle: 'none', m: 0, p: 0, pt: 2 }}
          >
            {messages.map((message, index) => (
              <Bubble key={index} message={message} you={t.you} coach={t.coach} />
            ))}
            {reply && (
              <Bubble message={{ role: 'assistant', text: reply }} you={t.you} coach={t.coach} />
            )}
            {busy === 'reply' && !reply && (
              <Box component="li" sx={{ pl: 6 }}>
                <CircularProgress size={20} aria-label={t.speaking} />
              </Box>
            )}
          </Stack>
        )}
        <div ref={end} />
      </Box>

      <Box
        sx={{
          position: 'sticky',
          // Sits directly above the compact navigation bar (84dp + safe area).
          bottom: { xs: 'calc(var(--nav-offset, 84px) + env(safe-area-inset-bottom))', sm: 0 },
          pb: 2,
          pt: 1,
          bgcolor: 'background.default',
          zIndex: 2,
        }}
      >
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        {voice.error && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            {voice.error}
          </Alert>
        )}
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          sx={{
            bgcolor: roles.surfaceContainerHigh,
            borderRadius: `${shape.xl}px`,
            px: 2,
            pt: 1.5,
            pb: 1,
          }}
        >
          <InputBase
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              // Desktop: Enter sends (Shift+Enter = new line). Touch keyboards: Enter is a new
              // line and the Send button sends, so half-typed messages aren't sent by accident.
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !matchMedia('(pointer: coarse)').matches
              ) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder={t.messagePlaceholder}
            multiline
            maxRows={6}
            fullWidth
            disabled={voice.state !== 'idle'}
            inputProps={{ 'aria-label': t.message, maxLength: 2000 }}
            sx={{ ...theme.typography.bodyLarge, px: 1, py: 1 }}
          />
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
            <Tooltip title={t.photo}>
              <span>
                <IconButton
                  aria-label={t.photo}
                  disabled={busy !== 'idle' || voice.state !== 'idle'}
                  onClick={() => photoInput.current?.click()}
                >
                  {busy === 'photo' ? (
                    <CircularProgress size={20} aria-label={t.checkingPhoto} />
                  ) : (
                    <Camera size={22} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <input
              ref={photoInput}
              type="file"
              accept={PHOTO_TYPES.join(',')}
              hidden
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadPhoto(file)
              }}
            />
            <Tooltip
              title={
                voice.state === 'recording'
                  ? t.finishTalking
                  : voice.state === 'idle'
                    ? t.talk
                    : t.stopVoice
              }
            >
              <span>
                <IconButton
                  aria-label={
                    voice.state === 'recording'
                      ? t.finishTalking
                      : voice.state === 'idle'
                        ? t.talk
                        : t.stopVoice
                  }
                  aria-pressed={voice.state === 'recording'}
                  disabled={busy !== 'idle'}
                  onClick={() => {
                    if (voice.state === 'recording') voice.finishRecording()
                    else if (voice.state === 'idle') void voice.start()
                    else voice.stop()
                  }}
                  sx={
                    voice.state === 'recording'
                      ? {
                          bgcolor: roles.primaryContainer,
                          color: roles.onPrimaryContainer,
                          '&:hover': { bgcolor: roles.primaryContainer },
                        }
                      : undefined
                  }
                >
                  {voice.state === 'idle' || voice.state === 'recording' ? (
                    <Mic size={22} />
                  ) : (
                    <Square size={18} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            {voice.state !== 'idle' && (
              <IconButton aria-label={voice.muted ? t.unmute : t.mute} onClick={voice.toggleMute}>
                {voice.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </IconButton>
            )}
            <Typography
              variant="bodySmall"
              color="text.secondary"
              role="status"
              sx={{ flex: 1, px: 1 }}
              noWrap
            >
              {voice.state === 'recording'
                ? t.listening
                : voice.state === 'replying'
                  ? t.speaking
                  : busy === 'photo'
                    ? t.checkingPhoto
                    : ''}
            </Typography>
            {busy === 'reply' ? (
              <IconButton
                aria-label={t.stop}
                onClick={() => {
                  controller.current?.abort()
                  setBusy('idle')
                }}
                sx={{
                  bgcolor: roles.secondaryContainer,
                  color: roles.onSecondaryContainer,
                  '&:hover': { bgcolor: roles.secondaryContainer },
                }}
              >
                <Square size={18} />
              </IconButton>
            ) : (
              <IconButton
                type="submit"
                aria-label={t.send}
                disabled={!canSend}
                sx={{
                  bgcolor: canSend ? roles.primary : 'transparent',
                  color: canSend ? roles.onPrimary : undefined,
                  '&:hover': { bgcolor: canSend ? roles.primary : undefined },
                }}
              >
                <ArrowUp size={22} />
              </IconButton>
            )}
          </Stack>
        </Box>
        <Typography
          variant="bodySmall"
          color="text.secondary"
          sx={{ display: 'block', textAlign: 'center', mt: 1 }}
        >
          {t.reviewNote}
        </Typography>
      </Box>
    </Box>
  )
}

function Bubble({ message, you, coach }: { message: Message; you: string; coach: string }) {
  const roles = useTheme().material
  if (message.role === 'user')
    return (
      <Box component="li" sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Box
          sx={{
            maxWidth: '85%',
            bgcolor: roles.surfaceContainerHigh,
            color: roles.onSurface,
            px: 2.5,
            py: 1.5,
            borderRadius: `${shape.xl}px ${shape.xs}px ${shape.xl}px ${shape.xl}px`,
          }}
        >
          <Typography component="span" sx={visuallyHidden}>
            {you}:{' '}
          </Typography>
          <Typography variant="bodyLarge" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {message.text}
          </Typography>
        </Box>
      </Box>
    )
  return (
    <Stack component="li" direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Avatar
        sx={{
          width: 32,
          height: 32,
          bgcolor: roles.primaryContainer,
          color: roles.onPrimaryContainer,
        }}
        aria-hidden="true"
      >
        <Leaf size={18} />
      </Avatar>
      <Box sx={{ minWidth: 0, pt: 0.5 }}>
        <Typography component="span" sx={visuallyHidden}>
          {coach}:{' '}
        </Typography>
        <Typography variant="bodyLarge" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {message.text}
        </Typography>
      </Box>
    </Stack>
  )
}
