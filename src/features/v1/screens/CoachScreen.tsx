import { chatBubbleStyle } from '../../coach/bubbleStyle'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import {
  ArrowUp,
  History,
  ImagePlus,
  Leaf,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  PackagePlus,
  Plus,
  Share2,
  Square,
  Store,
  Tag,
  Volume2,
  VolumeX,
  ZapOff,
} from 'lucide-react'
import { visuallyHidden } from '@mui/utils'
import { RateLimitError, streamCoach } from '../../../api/stream'
import type { CoachEvent } from '../../../api/stream'
import { useIdentity } from '../../../auth/useIdentity'
import { useLocale } from '../../../state/hooks'
import { ApiError } from '../api'
import type { Conversation, PhotoResult, Proposal } from '../api'
import { defaultCurrency } from '../format'
import { useCopy } from '../strings'
import { Sheet } from '../Sheet'
import { ShopCard, ShopSheet, StartCard } from '../ShopCard'
import { PendingCard } from '../PendingCard'
import { ShopSheets } from '../ShopTiles'
import type { ShopSheetKind } from '../ShopTiles'
import { useUnread } from '../useUnread'
import { useVoice } from '../useVoice'
import { useOnline } from '../useOnline'
import { useWorkspace } from '../workspaceContext'
import { enterRise, shape } from '../../../design/theme'

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
  const online = useOnline()
  const [reconnecting, setReconnecting] = useState(false)
  const [mode, setMode] = useState<'offline' | 'gemini' | null>(null)
  const [history, setHistory] = useState<Conversation[]>([])
  // One "+" sheet holds every coach action: add shop/product, new chat, earlier chats.
  const [actionsOpen, setActionsOpen] = useState(false)
  // Shop details sheet: null = closed, -1 = open, n = open on product n.
  const [sheet, setSheet] = useState<number | null>(null)
  const openSheet = (product?: number) => setSheet(product ?? -1)
  // My shop sheets opened from suggestion chips.
  const [shopSheet, setShopSheet] = useState<ShopSheetKind | null>(null)
  const { unread, refresh: refreshUnread } = useUnread()
  const messageInput = useRef<HTMLTextAreaElement>(null)
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
  // A chat starter from My shop ("Customers ask: halal?") lands in the composer once.
  const { coachDraft, consumeCoachDraft } = ws
  const [seenDraft, setSeenDraft] = useState<string | null>(null)
  if (coachDraft !== seenDraft) {
    setSeenDraft(coachDraft)
    if (coachDraft !== null) setNote(coachDraft)
  }
  useEffect(() => {
    if (coachDraft === null) return
    consumeCoachDraft()
    messageInput.current?.focus()
  }, [coachDraft, consumeCoachDraft])

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
      await streamCoach(
        {
          message,
          language,
          currency: defaultCurrency(),
          session_id: session.current,
          business_id: activeId,
        },
        abort.signal,
        (event) => {
          receive(event)
          if (event.kind === 'delta') finalReply += event.text ?? ''
          if (event.kind === 'reply') finalReply = event.text ?? ''
          if (event.kind === 'proposal') proposed = true
        },
        identity.getToken,
        (state) => setReconnecting(state === 'reconnecting'),
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
      // History is supplemental; a failed refresh must never roll back a completed turn.
      const items = await api<Conversation[]>('/conversations').catch(() => null)
      if (items && controller.current === abort) setHistory(items)
    } catch (cause) {
      if (!abort.signal.aborted) {
        setError(cause instanceof RateLimitError ? t.rateLimited : t.replyFailed)
        // Keep the unsent message available for a retry.
        setMessages((items) => items.slice(0, -1))
        setNote(message)
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setBusy('idle')
        setReconnecting(false)
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
        cause instanceof ApiError && cause.status === 429
          ? t.rateLimited
          : code === 'PHOTO_BLOCKED' || code === 'NOT_BUSINESS_PHOTO'
            ? t.photoRefused
            : t.photoFailed,
      )
    } finally {
      setBusy('idle')
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  async function restore(id: string) {
    setActionsOpen(false)
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
  // Suggestion chips are rules only (no AI): they come from the current shop state, never a
  // fixed list, and at most three show. Each one either opens the right sheet or starts a note.
  type Suggestion = 'reply' | 'menu' | 'soldOut' | 'price' | 'share' | 'photo' | 'name'
  const shop = ws.active
  const rules: [Suggestion, boolean][] = shop
    ? [
        // On an empty thread the pending card already says customers are waiting.
        ['reply', Boolean(unread) && !empty],
        ['menu', ws.products.length === 0],
        ['soldOut', ws.products.length > 0],
        ['price', ws.products.length > 0],
        ['share', !shop.public],
      ]
    : [
        ['photo', true],
        ['name', true],
      ]
  const chipCopy: Record<Suggestion, { label: string; icon: ReactElement }> = {
    reply: { label: t.chipReply(unread ?? 0), icon: <MessageSquare size={18} /> },
    menu: { label: t.chipAddMenu, icon: <ImagePlus size={18} /> },
    soldOut: { label: t.chipSoldOut, icon: <ZapOff size={18} /> },
    price: { label: t.chipPrice, icon: <Tag size={18} /> },
    share: { label: t.chipShare, icon: <Share2 size={18} /> },
    photo: { label: t.chipBoardPhoto, icon: <ImagePlus size={18} /> },
    name: { label: t.chipShopName, icon: <Store size={18} /> },
  }
  const suggestions = rules
    .filter(([, applies]) => applies)
    .slice(0, 3)
    .map(([id]) => ({ id, ...chipCopy[id] }))
  function suggest(id: Suggestion) {
    if (id === 'reply') setShopSheet('messages')
    else if (id === 'soldOut') setShopSheet('soldOut')
    else if (id === 'share') setShopSheet('customer')
    else if (id === 'menu' || id === 'photo') photoInput.current?.click()
    else {
      setNote(`${id === 'price' ? t.chipPrice : t.fields.name}: `)
      messageInput.current?.focus()
    }
  }
  const chips = (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
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
            ...enterRise,
          }}
        />
      ))}
    </Stack>
  )
  const lastIsReply = messages.at(-1)?.role === 'assistant' && !reply && busy === 'idle'
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
      {/* One quiet row: which coach is answering, and every other action behind one "+". */}
      <Stack direction="row" sx={{ alignItems: 'center', minHeight: 48, gap: 1 }}>
        <Typography variant="labelMedium" color="text.secondary" sx={{ flex: 1 }} noWrap>
          {mode ? (mode === 'gemini' ? t.geminiMode : t.offlineMode) : ''}
        </Typography>
        <Tooltip title={t.newChat}>
          <IconButton
            aria-label={t.newChat}
            aria-haspopup="dialog"
            onClick={() => setActionsOpen(true)}
          >
            <Plus size={20} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Sheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        titleId="coach-actions-title"
        title={t.newChat}
        actions={<Button onClick={() => setActionsOpen(false)}>{t.cancel}</Button>}
      >
        <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Button
            startIcon={<Store size={18} />}
            onClick={() => {
              setActionsOpen(false)
              ws.openEditor({ kind: 'business', fields: null })
            }}
          >
            {t.addShop}
          </Button>
          {ws.active && (
            <Button
              startIcon={<PackagePlus size={18} />}
              onClick={() => {
                setActionsOpen(false)
                ws.openEditor({ kind: 'product', product: null })
              }}
            >
              {t.addProduct}
            </Button>
          )}
          <Button
            startIcon={<MessageSquarePlus size={18} />}
            disabled={empty}
            onClick={() => {
              setActionsOpen(false)
              resetThread()
            }}
          >
            {t.newChat}
          </Button>
        </Stack>
        {shopHistory.length > 0 && (
          <List
            dense
            subheader={
              <ListSubheader sx={{ bgcolor: 'transparent', px: 0, lineHeight: '36px' }}>
                {t.history}
              </ListSubheader>
            }
            sx={{ mt: 4 }}
          >
            {shopHistory.map((entry) => (
              <ListItemButton key={entry.session_id} onClick={() => void restore(entry.session_id)}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <History size={18} />
                </ListItemIcon>
                <ListItemText
                  primary={new Date(entry.updated * 1000).toLocaleString(language, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Sheet>

      <Box sx={{ flex: 1, pb: 4 }}>
        {empty ? (
          <Stack spacing={5} sx={{ pt: { xs: 4, sm: 10 }, pb: 4 }}>
            <Typography component="h1" variant="headlineMedium">
              {ws.active ? t.coachGreetingShop(ws.active.fields.name) : t.coachGreeting}
            </Typography>
            {ws.active ? <ShopCard onOpen={openSheet} /> : <StartCard />}
            {ws.active && (
              <PendingCard
                unread={unread}
                onMessages={() => setShopSheet('messages')}
                onAnswer={(fact) => {
                  setNote(`${t.factNames[fact]}: `)
                  messageInput.current?.focus()
                }}
              />
            )}{' '}
            {/* Before a shop exists the start card is the only thing shown. */}
            {ws.active && chips}
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
            {lastIsReply && <Box sx={{ pt: 4, pl: 10 }}>{chips}</Box>}
          </>
        )}
        <div ref={end} />
      </Box>
      <ShopSheet
        open={sheet !== null}
        focusProduct={sheet !== null && sheet >= 0 ? sheet : null}
        onClose={() => setSheet(null)}
        onAnswer={(fact) => {
          setNote(`${t.factNames[fact]}: `)
          messageInput.current?.focus()
        }}
      />
      <ShopSheets
        kind={shopSheet}
        onClose={() => {
          if (shopSheet === 'messages') refreshUnread()
          setShopSheet(null)
        }}
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
          sx={{ display: 'block', px: 4, '&:not(:empty)': { pb: 2 } }}
        >
          {!online
            ? t.connectionOffline
            : reconnecting || voice.state === 'reconnecting'
              ? t.connectionReconnecting
              : voice.state === 'recording'
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
            inputRef={messageInput}
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
              // A blur on press would bring back the nav bar and move this button before the tap
              // lands; keep focus until the click, then let go so the nav returns.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                messageInput.current?.blur()
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
              onMouseDown={(event) => event.preventDefault()}
              // The form still submits after this click; the nav comes back once it has landed.
              onClick={() => messageInput.current?.blur()}
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
        <Box sx={chatBubbleStyle(roles)}>
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
