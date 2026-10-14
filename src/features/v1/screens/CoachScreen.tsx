import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputBase,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import {
  ArrowUp,
  Clock,
  EllipsisVertical,
  History,
  ImagePlus,
  Leaf,
  Mic,
  Plus,
  Square,
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
import { defaultCurrency } from '../format'
import { useCopy } from '../strings'
import { ShopCard, ShopSheet, StartCard } from '../ShopCard'
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
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  // Shop details sheet: null = closed, -1 = open, n = open on product n.
  const [sheet, setSheet] = useState<number | null>(null)
  const openSheet = (product?: number) => setSheet(product ?? -1)
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
    let proposed = false
    try {
      const token = await identity.getToken()
      await streamCoach(
        { message, language, session_id: session.current, business_id: activeId },
        abort.signal,
        (event) => {
          receive(event)
          if (event.kind === 'delta') finalReply += event.text ?? ''
          if (event.kind === 'reply') finalReply = event.text ?? ''
          if (event.kind === 'proposal') proposed = true
        },
        token,
      )
      if (controller.current !== abort) return
      // The model occasionally returns an empty turn; treat it like a failed reply so the
      // owner sees why and can resend, instead of an empty bubble.
      if (!finalReply.trim() && !proposed) throw new Error('EMPTY_REPLY')
      if (finalReply.trim())
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
      // A new shop takes the phone region's currency; an existing shop keeps its own.
      const query = activeId
        ? `?business_id=${encodeURIComponent(activeId)}`
        : `?currency=${defaultCurrency()}`
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
    setMenuAnchor(null)
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
  // Quick starts once a shop exists. Photos live on the composer and the shop card's next
  // step; before a shop exists the start card carries every action.
  const suggestions: { label: string; icon: ReactElement }[] = [
    { label: t.suggestPrice, icon: <Tag size={18} /> },
    { label: t.suggestHours, icon: <Clock size={18} /> },
  ]
  // The top row only appears once there is something to show or do in it.
  const showTopRow = Boolean(mode) || !empty || shopHistory.length > 0
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
      {/* One quiet row: which coach is answering, and everything else in one overflow menu. */}
      {showTopRow && (
        <Stack direction="row" sx={{ alignItems: 'center', minHeight: 48, gap: 1 }}>
          <Typography variant="labelMedium" color="text.secondary" sx={{ flex: 1 }} noWrap>
            {mode ? (mode === 'gemini' ? t.geminiMode : t.offlineMode) : ''}
          </Typography>
          <Tooltip title={t.moreOptions}>
            <IconButton
              aria-label={t.moreOptions}
              aria-haspopup="menu"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
            >
              <EllipsisVertical size={20} />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <MenuItem
              disabled={empty}
              onClick={() => {
                setMenuAnchor(null)
                resetThread()
              }}
            >
              <ListItemIcon>
                <Plus size={18} />
              </ListItemIcon>
              <ListItemText primary={t.newChat} />
            </MenuItem>
            {shopHistory.length > 0 && <Divider />}
            {shopHistory.length > 0 && (
              <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: '36px' }}>
                {t.history}
              </ListSubheader>
            )}
            {shopHistory.map((entry) => (
              <MenuItem key={entry.session_id} onClick={() => void restore(entry.session_id)}>
                <ListItemIcon>
                  <History size={18} />
                </ListItemIcon>
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
      )}

      <Box sx={{ flex: 1, pb: 4 }}>
        {empty ? (
          <Stack spacing={5} sx={{ pt: { xs: showTopRow ? 4 : 10, sm: 10 }, pb: 4 }}>
            <Typography component="h1" variant="headlineMedium">
              {ws.active ? t.coachGreetingShop(ws.active.fields.name) : t.coachGreeting}
            </Typography>
            {ws.active ? <ShopCard onOpen={openSheet} /> : <StartCard />}
            {ws.active && (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
                {suggestions.map((item) => (
                  <Chip
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    variant="outlined"
                    onClick={() => setNote(item.label + ': ')}
                    sx={{
                      height: 40,
                      px: 1,
                      borderColor: roles.outlineVariant,
                      '& .MuiChip-icon': { color: roles.primary },
                    }}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        ) : (
          <>
            {ws.active && (
              // Stays under the app bar while the conversation scrolls, filling in as
              // proposals are confirmed.
              <Box
                sx={{
                  position: 'sticky',
                  top: 'calc(64px + env(safe-area-inset-top))',
                  zIndex: 2,
                  bgcolor: 'background.default',
                  pb: 2,
                }}
              >
                <ShopCard dense onOpen={openSheet} />
              </Box>
            )}
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
                <Box component="li" sx={{ pl: 10 }}>
                  <CircularProgress size={20} aria-label={t.speaking} />
                </Box>
              )}
            </Stack>
          </>
        )}
        <div ref={end} />
      </Box>
      <ShopSheet
        open={sheet !== null}
        focusProduct={sheet !== null && sheet >= 0 ? sheet : null}
        onClose={() => setSheet(null)}
      />

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
        <Typography
          variant="labelMedium"
          color="text.secondary"
          role="status"
          noWrap
          sx={{ display: 'block', px: 4, '&:not(:empty)': { pb: 2 } }}
        >
          {voice.state === 'recording'
            ? t.listening
            : voice.state === 'replying'
              ? t.speaking
              : busy === 'photo'
                ? t.checkingPhoto
                : ''}
        </Typography>
        {/* One-line composer: attach, text, mic, send. Grows upward for long messages. */}
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 0.5,
            bgcolor: roles.surfaceContainerHigh,
            borderRadius: `${shape.xl}px`,
            p: 1,
          }}
        >
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
                  <ImagePlus size={22} />
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
            // 16px keeps iOS from zooming on focus; 12 + 24 + 12 matches the 48dp buttons.
            sx={{ flex: 1, px: 1, py: 3, fontSize: '1rem', lineHeight: '1.5rem' }}
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
        </Box>
        {/* Phones: the review sheet already says this, so the coach screen stays quiet. */}
        <Typography
          variant="bodySmall"
          color="text.secondary"
          sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'center', mt: 2 }}
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
