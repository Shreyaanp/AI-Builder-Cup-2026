import { chatBubbleStyle } from '../../coach/bubbleStyle'
import { photoCopy } from '../../coach/photoCopy'
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  ArrowUp,
  Camera,
  History,
  ImagePlus,
  ImageUp,
  FileSpreadsheet,
  Paperclip,
  Leaf,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  PackagePlus,
  Share2,
  Square,
  Store,
  Tag,
  Volume2,
  VolumeX,
  ZapOff,
} from 'lucide-react'
import { visuallyHidden } from '@mui/utils'
import { CoachChart, type CoachChartData } from '../CoachChart'
import { RateLimitError, streamCoach } from '../../../api/stream'
import type { CoachEvent } from '../../../api/stream'
import { useIdentity } from '../../../auth/useIdentity'
import { useLocale } from '../../../state/hooks'
import { ApiError } from '../api'
import type { Conversation, PhotoResult, Proposal } from '../api'
import { defaultCurrency } from '../format'
import { useCopy } from '../strings'
import { Sheet } from '../Sheet'
import { useBackClose } from '../backStack'
import { SalesImportSheet } from '../ImportMenu'
import { DOCUMENT_ACCEPT, useImport, type SalesImport } from '../useImport'
import { ShopCard, ShopSheet, StartCard } from '../ShopCard'
import { TourOffer } from '../../tour/Tour'
import { PendingCard } from '../PendingCard'
import { ShopSheets } from '../ShopTiles'
import { FreshnessCard, RecapTile } from '../../sales/ShopInsights'
import type { ShopSheetKind } from '../ShopTiles'
import { useUnread } from '../useUnread'
import { useVoice } from '../useVoice'
import { useOnline } from '../useOnline'
import { useWorkspace } from '../workspaceContext'
import { OwnerJourney } from '../../frontdoors/OwnerJourney'
import { enterRise, shape, windowClass } from '../../../design/theme'
import { useSourcingCopy } from '../../sourcing/copy'
import { OrdersSheet } from '../../sourcing/Orders'
import { useReceiveOrder } from '../../sourcing/orderData'
import { OrderCard, SearchingSuppliers, SupplierCarousel } from '../../sourcing/SourcingCards'
import type { Order, SupplierResult } from '../../sourcing/types'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// The composer grows with multi-line text up to this many lines, then scrolls.
const COMPOSER_ROWS = 6
type Message =
  | { role: 'user' | 'assistant'; text: string }
  // Sourcing cards live in the conversation; an order card always shows the order's latest state.
  | { role: 'suppliers'; result: SupplierResult; key: string }
  | { role: 'order'; orderId: string }
  // A chart beside a forecast or "how is business" answer.
  | { role: 'chart'; chart: CoachChartData; key: string }
const REPLY_POLL_MS = 1500
const REPLY_WAIT_MS = 45_000

type GalleryPhoto = { file: File; businessId: string }

// The extraction file survives the new-shop confirmation, which changes the chat's key.
// It stays local to this coach workspace and never enters preference storage.
export function CoachWorkspace() {
  const { activeId } = useWorkspace()
  const [galleryPhoto, setGalleryPhoto] = useState<GalleryPhoto | null>(null)
  return (
    <CoachScreen
      key={activeId ?? 'no-shop'}
      galleryPhoto={galleryPhoto}
      setGalleryPhoto={setGalleryPhoto}
    />
  )
}

function CoachScreen({
  galleryPhoto,
  setGalleryPhoto,
}: {
  galleryPhoto: GalleryPhoto | null
  setGalleryPhoto: (value: GalleryPhoto | null) => void
}) {
  const t = useCopy()
  const theme = useTheme()
  const roles = theme.material
  const identity = useIdentity()
  const language = useLocale()
  const photoText = photoCopy(language)
  const ws = useWorkspace()
  const [messages, setMessages] = useState<Message[]>([])
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'idle' | 'reply' | 'photo'>('idle')
  const [error, setError] = useState('')
  const [photoPin, setPhotoPin] = useState<Proposal | null>(null)
  const online = useOnline()
  const [reconnecting, setReconnecting] = useState(false)
  const [mode, setMode] = useState<'offline' | 'gemini' | null>(null)
  const [history, setHistory] = useState<Conversation[]>([])
  const s = useSourcingCopy()
  // Sourcing: the item being searched for, every order shown in the chat, the open thread.
  const [searching, setSearching] = useState<string | null>(null)
  const [orders, setOrders] = useState<Record<string, Order>>({})
  const [thread, setThread] = useState<string | null>(null)
  const watching = useRef(new Set<string>())
  const receiveOrder = useReceiveOrder()
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
  const photoButton = useRef<HTMLButtonElement>(null)
  // One attach button: Take photo (phones: there is no camera capture on a desktop), Photo
  // library, and Document (PDF/Excel/CSV, once there is a shop to import into).
  const touch = useMediaQuery('(pointer: coarse)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [photoMenu, setPhotoMenu] = useState<HTMLElement | null>(null)
  const [sales, setSales] = useState<SalesImport | null>(null)
  const importer = useImport({ onSales: setSales })
  const picking = useRef<'photo' | 'document'>('photo')
  const choices = touch || Boolean(ws.active)
  function choosePhoto(anchor: HTMLElement | null) {
    if (choices && anchor) setPhotoMenu(anchor)
    else pick('library')
  }
  // One file input for every choice (`capture` opens the rear camera directly, `accept` picks
  // photos or documents), so the page keeps a single picker.
  function pick(kind: 'camera' | 'library' | 'document') {
    setPhotoMenu(null)
    const input = photoInput.current
    if (!input) return
    picking.current = kind === 'document' ? 'document' : 'photo'
    input.accept = kind === 'document' ? DOCUMENT_ACCEPT : PHOTO_TYPES.join(',')
    if (kind === 'camera') input.setAttribute('capture', 'environment')
    else input.removeAttribute('capture')
    input.click()
  }
  const speaking = useRef<HTMLAudioElement | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const { api, activeId, review, setFaceOpen, go, speakReplies } = ws
  // One "+" sheet (opened from the top bar) holds every coach action: add shop/product, new
  // chat, earlier chats.
  const actionsOpen = ws.coachActions
  const setActionsOpen = ws.setCoachActions

  const receive = useCallback(
    (event: CoachEvent) => {
      if (event.kind === 'ready') {
        session.current = event.session_id ?? session.current
        setMode(event.mode ?? 'offline')
        if (event.code === 'CONVERSATION_ROLLED_OVER')
          setMessages((items) => [...items, { role: 'assistant', text: t.conversationRolledOver }])
      }
      if (event.kind === 'delta') setReply((text) => text + (event.text ?? ''))
      if (event.kind === 'reply' || event.kind === 'output_transcript') setReply(event.text ?? '')
      if (event.kind === 'input_transcript')
        setMessages((items) => [...items, { role: 'user', text: event.text ?? '' }])
      if (event.kind === 'proposal') review(event.data as unknown as Proposal)
      if (event.kind === 'sourcing') setSearching(String(event.data?.item ?? ''))
      if (event.kind === 'suppliers') {
        setSearching(null)
        const result = event.data as unknown as SupplierResult
        setMessages((items) =>
          [...items, { role: 'suppliers' as const, result, key: crypto.randomUUID() }].slice(-40),
        )
      }
      if (event.kind === 'chart' && event.data) {
        const chart = event.data as unknown as CoachChartData
        setMessages((items) =>
          [...items, { role: 'chart' as const, chart, key: crypto.randomUUID() }].slice(-40),
        )
      }
      if (event.kind === 'order') {
        const order = event.data as unknown as Order
        setOrders((known) => ({ ...known, [order.id]: order }))
        // One card per order, moved to the end when the coach updates it.
        setMessages((items) =>
          [
            ...items.filter((item) => !(item.role === 'order' && item.orderId === order.id)),
            { role: 'order' as const, orderId: order.id },
          ].slice(-40),
        )
      }
      if (event.kind === 'turn_complete') setSearching(null)
      if (event.kind === 'workflow' && event.data?.status === 'verification_required') {
        go('privacy')
        setFaceOpen(true)
      }
    },
    [review, go, setFaceOpen, t.conversationRolledOver],
  )
  const voiceReply = useRef('')
  const voice = useVoice(activeId, (event) => {
    receive(event)
    if (event.kind === 'ready') voiceReply.current = ''
    if (event.kind === 'reply' || event.kind === 'output_transcript')
      voiceReply.current = event.text ?? ''
    if (event.kind === 'turn_complete') {
      const text = voiceReply.current
      if (text) setMessages((items) => [...items, { role: 'assistant' as const, text }].slice(-40))
      voiceReply.current = ''
      setReply('')
    }
  })

  // Each shop has its own conversation thread.
  useEffect(() => {
    const abort = new AbortController()
    controller.current?.abort()
    session.current = null
    void api<Conversation[]>('/conversations', { signal: abort.signal })
      .then(async (items) => {
        if (abort.signal.aborted) return
        setHistory(items)
        // Coming back (reload, another day) continues this shop's latest conversation instead of
        // a blank screen. Once per visit: "New chat" still starts fresh.
        const latest = items.find((entry) => (entry.business_id ?? null) === activeId)
        if (latest && !session.current) await restore(latest.session_id)
      })
      .catch(() => undefined)
    return () => {
      abort.abort()
      speechSynthesis.cancel()
      speaking.current?.pause()
    }
    // `restore` is a plain function re-created each render; this runs once per shop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, activeId])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: reducedMotion ? 'instant' : 'smooth' })
  }, [messages, reply, reducedMotion])
  // The composer is one line until the text itself needs more. Sized from the text only: the
  // old autosize also measured the placeholder, so a long translated hint made an empty
  // composer two or three lines tall (B3).
  useLayoutEffect(() => {
    const field = messageInput.current
    if (!field) return
    const base = language === 'ta' ? 56 : 48
    field.style.height = `${base}px`
    if (note) field.style.height = `${Math.max(base, field.scrollHeight)}px`
  }, [note, voice.state, language])
  // A pending request (e.g. "Start from a photo" on My shop) opens the chooser once, from the
  // composer's photo button.
  const { photoPending, consumePhotoRequest } = ws
  useEffect(() => {
    if (!photoPending) return
    consumePhotoRequest()
    if (choices && photoButton.current) setPhotoMenu(photoButton.current)
    else {
      photoInput.current?.removeAttribute('capture')
      photoInput.current?.click()
    }
  }, [photoPending, consumePhotoRequest, choices])
  // A chat starter from My shop ("Customers ask: halal?") lands in the composer once.
  const { coachDraft, consumeCoachDraft } = ws
  const [seenDraft, setSeenDraft] = useState<string | null>(null)
  if (coachDraft !== seenDraft) {
    setSeenDraft(coachDraft)
    if (coachDraft !== null) setNote(coachDraft)
  }
  const sendDraft = useEffectEvent((text: string) => {
    void send(text)
  })
  const { coachDraftSend } = ws
  useEffect(() => {
    if (coachDraft === null) return
    consumeCoachDraft()
    if (coachDraftSend) sendDraft(coachDraft)
    else messageInput.current?.focus()
  }, [coachDraft, coachDraftSend, consumeCoachDraft])

  // A typed draft: Back asks "Discard changes?" before leaving, and so does closing the tab.
  useBackClose(
    Boolean(note.trim()),
    () => {
      setNote('')
      window.history.back()
    },
    true,
  )

  function resetThread() {
    controller.current?.abort()
    voice.stop()
    session.current = null
    setSearching(null)
    setMessages([])
    setReply('')
    setError('')
  }

  // Natural Google voice for replies; the phone's own voice if that isn't available.
  async function speakReply(text: string) {
    speechSynthesis.cancel()
    speaking.current?.pause()
    try {
      const response = await api<Response>('/tts', {
        method: 'POST',
        body: JSON.stringify({ text, language }),
        raw: true,
      })
      if (response.status === 200) {
        const url = URL.createObjectURL(await response.blob())
        const audio = new Audio(url)
        audio.onended = () => URL.revokeObjectURL(url)
        speaking.current = audio
        await audio.play()
        return
      }
    } catch {
      // Fall through to on-device speech.
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language
    speechSynthesis.speak(utterance)
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
      if (speakReplies && finalReply) void speakReply(finalReply)
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
        setSearching(null)
        setReconnecting(false)
      }
    }
  }

  const orderPath = (id: string) =>
    `/businesses/${encodeURIComponent(activeId ?? '')}/orders/${encodeURIComponent(id)}`

  // After Send, wait for the supplier's answer and announce it in this conversation.
  async function watchReply(order: Order) {
    if (watching.current.has(order.id)) return
    watching.current.add(order.id)
    const before = order.messages.filter((message) => message.author === 'supplier').length
    const until = Date.now() + REPLY_WAIT_MS
    try {
      while (Date.now() < until) {
        await new Promise((resolve) => window.setTimeout(resolve, REPLY_POLL_MS))
        const latest = await api<Order>(orderPath(order.id)).catch(() => null)
        if (!latest) continue
        setOrders((known) => ({ ...known, [latest.id]: latest }))
        const replies = latest.messages.filter((message) => message.author === 'supplier')
        if (replies.length > before) {
          const reply = replies[replies.length - 1]!
          const text = s.replied(latest.supplier.name, reply.text)
          setMessages((items) => [...items, { role: 'assistant' as const, text }].slice(-40))
          if (speakReplies) void speakReply(text)
          void api(`${orderPath(latest.id)}/read`, { method: 'POST' }).catch(() => undefined)
          return
        }
      }
    } finally {
      watching.current.delete(order.id)
    }
  }

  async function sendOrder(order: Order): Promise<boolean> {
    setError('')
    try {
      const sent = await api<Order>(`${orderPath(order.id)}/send`, {
        method: 'POST',
        body: JSON.stringify({ version: order.version }),
      })
      setOrders((known) => ({ ...known, [sent.id]: sent }))
      void watchReply(sent)
      return true
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'ADD_SHOP_PHONE' ? s.addPhone : s.sendFailed,
      )
      return false
    }
  }

  async function discardOrder(order: Order) {
    try {
      const dropped = await api<Order>(`${orderPath(order.id)}/discard`, {
        method: 'POST',
        body: JSON.stringify({ version: order.version }),
      })
      setOrders((known) => ({ ...known, [dropped.id]: dropped }))
    } catch {
      setError(t.actionFailed)
    }
  }

  async function uploadPhoto(file: File) {
    if (busy !== 'idle') return
    setError('')
    if (!PHOTO_TYPES.includes(file.type) || file.size > 20_000_000) {
      setError(t.photoType)
      return
    }
    setBusy('photo')
    setGalleryPhoto(null)
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
      setPhotoPin(result.pin_proposal ?? null)
      const businessId = activeId ?? result.proposal?.snapshot.business_id
      if (
        businessId &&
        ['storefront', 'signboard', 'menu', 'price_list'].includes(result.photo_kind)
      )
        setGalleryPhoto({ file, businessId })
      setMessages((items) =>
        [
          ...items,
          {
            role: 'assistant' as const,
            text: result.proposal ? t.photoRead + (notes ? `\n${notes}` : '') : t.photoNothing,
          },
        ].slice(-40),
      )
      // The review sheet carries the reader's doubts, so the decision surface discloses them.
      if (result.proposal)
        review({ ...result.proposal, photo_notes: result.extraction.uncertain.slice(0, 5) })
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
    voice.stop()
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
  function suggest(id: Suggestion, anchor: HTMLElement) {
    if (id === 'reply') setShopSheet('messages')
    else if (id === 'soldOut') setShopSheet('soldOut')
    else if (id === 'share') setShopSheet('customer')
    else if (id === 'menu' || id === 'photo') choosePhoto(anchor)
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
          onClick={(event) => suggest(item.id, event.currentTarget)}
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
  const voiceText =
    voice.state === 'recording' ? t.listening : voice.state === 'replying' ? t.speaking : ''

  return (
    <Box
      id="coach"
      component="section"
      aria-label={t.navCoach}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height:
          'calc(100dvh - 64px - var(--nav-offset, 0px) - 12px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        minHeight: 0,
        maxWidth: 760,
        mx: 'auto',
      }}
    >
      <OwnerJourney />
      {/* One quiet line: which coach is answering. Every other action is behind the top bar's +. */}
      {!empty && (
        <Typography
          variant="labelMedium"
          color="text.secondary"
          noWrap
          sx={{ display: 'block', minHeight: 32, pt: 2 }}
        >
          {mode ? (mode === 'gemini' ? t.geminiMode : t.offlineMode) : ''}
        </Typography>
      )}
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

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', pb: 4 }}>
        {galleryPhoto && galleryPhoto.businessId === ws.active?.id && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="titleSmall">{photoText.galleryOffer}</Typography>
            <Typography variant="bodySmall">{photoText.galleryNote}</Typography>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Button
                disabled={busy !== 'idle'}
                onClick={async () => {
                  setBusy('photo')
                  setError('')
                  try {
                    await api(
                      `/businesses/${encodeURIComponent(galleryPhoto.businessId)}/gallery`,
                      {
                        method: 'POST',
                        body: galleryPhoto.file,
                        headers: { 'Content-Type': galleryPhoto.file.type },
                        signal: AbortSignal.timeout(150_000),
                      },
                    )
                    setGalleryPhoto(null)
                    await ws.reload()
                  } catch {
                    setError(t.actionFailed)
                  } finally {
                    setBusy('idle')
                  }
                }}
              >
                {photoText.galleryAdd}
              </Button>
              <Button disabled={busy !== 'idle'} onClick={() => setGalleryPhoto(null)}>
                {photoText.later}
              </Button>
            </Stack>
          </Alert>
        )}
        {photoPin &&
          ws.active?.id === photoPin.snapshot.business_id &&
          // A precise photo location also replaces an approximate demo pin.
          (ws.active.fields.lat == null || ws.active.fields.pin_demo) && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {photoText.pinOffer}
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button
                  disabled={busy !== 'idle'}
                  onClick={async () => {
                    if (!ws.active || !photoPin.snapshot.business) return
                    setBusy('photo')
                    setError('')
                    try {
                      // Keep the photo coordinates, but review current shop details and revision.
                      // Any concurrent change is rejected by the normal sealed proposal endpoint.
                      const { lat, lng, place_id, pin_label, pin_demo } = photoPin.snapshot.business
                      const next = await api<Proposal>('/proposals', {
                        method: 'POST',
                        body: JSON.stringify({
                          kind: 'business',
                          business_id: ws.active.id,
                          revision: ws.active.revision,
                          business: {
                            ...ws.active.fields,
                            lat,
                            lng,
                            place_id,
                            pin_label,
                            pin_demo,
                          },
                        }),
                      })
                      review(next)
                    } catch {
                      setError(t.actionFailed)
                      await ws.reload()
                    } finally {
                      setBusy('idle')
                    }
                  }}
                >
                  {photoText.reviewPin}
                </Button>
                <Button onClick={() => setPhotoPin(null)}>{photoText.dismiss}</Button>
              </Stack>
            </Alert>
          )}
        {empty ? (
          <Stack spacing={{ xs: 3, sm: 5 }} sx={{ pt: { xs: 1, sm: 10 }, pb: 4 }}>
            {/* With a shop, the top bar already names it: no greeting line, only a heading for
                screen readers. Before a shop exists the greeting introduces the coach. */}
            {ws.active ? (
              <Typography component="h1" sx={visuallyHidden}>
                {t.navCoach}
              </Typography>
            ) : (
              <Typography
                component="h1"
                variant="headlineMedium"
                sx={{
                  fontSize: { xs: '1.5rem', sm: undefined },
                  lineHeight: { xs: '2rem', sm: undefined },
                }}
              >
                {t.coachGreeting}
              </Typography>
            )}
            {ws.active ? <ShopCard onOpen={openSheet} /> : <StartCard />}
            {/* First visit: see the product working on a filled demo shop. */}
            {ws.businesses.length === 0 && <TourOffer />}
            {/* Suggestions right under the shop card; before a shop exists the start card is
                the only thing shown. */}
            {ws.active && chips}
            {ws.active && (
              // Phones: one attention card at a time so the first view fits without scrolling.
              // The first card with something to say shows, the rest wait their turn (each one
              // also lives on My shop). A card with nothing to say renders nothing.
              <Box
                data-testid="coach-attention"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: { xs: 0, sm: 5 },
                  '& > :empty': { display: 'none' },
                  [`@media (max-width:${windowClass.medium - 1}px)`]: {
                    '& > :not(:empty) ~ *': { display: 'none' },
                  },
                  '&:not(:has(> :not(:empty)))': { display: 'none' },
                }}
              >
                <div>
                  <FreshnessCard key={`freshness-${ws.active.id}`} />
                </div>
                <div>
                  <RecapTile key={`recap-${ws.active.id}`} mondayOnly />
                </div>
                <div>
                  <PendingCard
                    unread={unread}
                    onMessages={() => setShopSheet('messages')}
                    onAnswer={(fact) => {
                      setNote(`${t.factNames[fact]}: `)
                      messageInput.current?.focus()
                    }}
                  />
                </div>
              </Box>
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
                  top: 0,
                  zIndex: 2,
                  bgcolor: 'background.default',
                  pb: 2,
                }}
              >
                <ShopCard dense onOpen={openSheet} />
                <FreshnessCard key={`freshness-${ws.active.id}`} compact />
              </Box>
            )}
            {/* The live region wraps the list: role="log" on the <ol> itself removed its list semantics. */}
            <Box role="log" aria-live="polite">
              <Stack component="ol" spacing={3} sx={{ listStyle: 'none', m: 0, p: 0, pt: 2 }}>
                {messages.map((message, index) =>
                  message.role === 'chart' ? (
                    <Box component="li" key={message.key} sx={{ display: 'flex' }}>
                      <CoachChart chart={message.chart} />
                    </Box>
                  ) : message.role === 'suppliers' ? (
                    <SupplierCarousel
                      key={message.key}
                      result={message.result}
                      onChoose={(card) => {
                        const amount = message.result.quantity
                          ? `${message.result.quantity} ${message.result.unit} `
                          : ''
                        setNote(s.chooseDraft(card.rank, `${amount}${message.result.item}`))
                        messageInput.current?.focus()
                      }}
                    />
                  ) : message.role === 'order' ? (
                    orders[message.orderId] && (
                      <OrderCard
                        key={message.orderId}
                        order={orders[message.orderId]!}
                        onSend={sendOrder}
                        onDiscard={discardOrder}
                        onOpen={(order) => setThread(order.id)}
                        onReceived={(order) =>
                          void receiveOrder(order).then((received) => {
                            if (received)
                              setOrders((known) => ({ ...known, [received.id]: received }))
                          })
                        }
                      />
                    )
                  ) : (
                    <Bubble key={index} message={message} you={t.you} coach={t.coach} />
                  ),
                )}
                {searching !== null && <SearchingSuppliers item={searching} />}
                {reply && (
                  <Bubble
                    message={{ role: 'assistant', text: reply }}
                    you={t.you}
                    coach={t.coach}
                  />
                )}
                {busy === 'reply' && !reply && searching === null && (
                  <Box component="li" sx={{ pl: 10 }}>
                    <CircularProgress size={20} aria-label={t.speaking} />
                  </Box>
                )}
              </Stack>
            </Box>
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
      <SalesImportSheet imported={sales} onClose={() => setSales(null)} />
      <OrdersSheet open={thread !== null} orderId={thread} onClose={() => setThread(null)} />
      <ShopSheets
        kind={shopSheet}
        onClose={() => {
          if (shopSheet === 'messages') refreshUnread()
          setShopSheet(null)
        }}
      />

      <Box
        sx={{
          position: 'relative',
          flexShrink: 0,
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
          {/* Listening and speaking show inside the composer, so this line stays empty for
              voice and the composer never jumps. */}
          {!online
            ? t.connectionOffline
            : reconnecting || voice.state === 'reconnecting'
              ? t.connectionReconnecting
              : busy === 'photo'
                ? t.checkingPhoto
                : ''}
        </Typography>
        {/* One-line composer: attach, text, mic, send. Grows upward only for multi-line text.
            Voice swaps contents in place (mute for attach, status for text), so the row keeps
            its size and the buttons never move. */}
        <Box
          component="form"
          data-tour="composer"
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
            '&:has(textarea:focus-visible)': { outline: `2px solid ${roles.primary}` },
          }}
        >
          {voice.state !== 'idle' ? (
            <IconButton aria-label={voice.muted ? t.unmute : t.mute} onClick={voice.toggleMute}>
              {voice.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </IconButton>
          ) : (
            <Tooltip title={t.attach} disableTouchListener>
              <span>
                <IconButton
                  aria-label={t.attach}
                  disabled={busy !== 'idle' || importer.busy}
                  ref={photoButton}
                  aria-haspopup={choices ? 'menu' : undefined}
                  onClick={(event) => choosePhoto(event.currentTarget)}
                >
                  {busy === 'photo' || importer.busy ? (
                    <CircularProgress size={20} aria-label={t.checkingPhoto} />
                  ) : (
                    <Paperclip size={22} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          )}
          <input
            ref={photoInput}
            type="file"
            accept={PHOTO_TYPES.join(',')}
            hidden
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              const input = event.currentTarget
              const file = input.files?.[0]
              const document = picking.current === 'document'
              // Back to photos for the next pick (and for anything that reads the input).
              picking.current = 'photo'
              input.accept = PHOTO_TYPES.join(',')
              if (!file) return
              if (document)
                void importer.upload(file).finally(() => {
                  input.value = ''
                })
              else void uploadPhoto(file)
            }}
          />
          <Menu
            anchorEl={photoMenu}
            open={Boolean(photoMenu)}
            onClose={() => setPhotoMenu(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            {touch && (
              <MenuItem onClick={() => pick('camera')} sx={{ minHeight: 48 }}>
                <ListItemIcon>
                  <Camera size={20} />
                </ListItemIcon>
                <ListItemText primary={t.photoTake} />
              </MenuItem>
            )}
            <MenuItem onClick={() => pick('library')} sx={{ minHeight: 48 }}>
              <ListItemIcon>
                <ImageUp size={20} />
              </ListItemIcon>
              <ListItemText primary={t.photoUpload} />
            </MenuItem>
            {ws.active && (
              <MenuItem onClick={() => pick('document')} sx={{ minHeight: 48 }}>
                <ListItemIcon>
                  <FileSpreadsheet size={20} />
                </ListItemIcon>
                <ListItemText primary={t.photoDocument} />
              </MenuItem>
            )}
          </Menu>
          {voiceText ? (
            <Typography
              role="status"
              variant="bodyLarge"
              noWrap
              sx={{ flex: 1, minWidth: 0, px: 1, py: 3, lineHeight: '1.5rem' }}
            >
              {voiceText}
            </Typography>
          ) : (
            <Box
              component="textarea"
              ref={messageInput}
              rows={1}
              name="message"
              autoComplete="off"
              value={note}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
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
              disabled={voice.state !== 'idle'}
              aria-label={t.message}
              maxLength={2000}
              // 16px keeps iOS from zooming on focus; 12 + 24 + 12 matches the 48dp buttons.
              sx={{
                flex: 1,
                minWidth: 0,
                boxSizing: 'border-box',
                height: language === 'ta' ? '56px' : '48px',
                maxHeight: `calc(${COMPOSER_ROWS} * ${language === 'ta' ? '2rem' : '1.5rem'} + 24px)`,
                m: 0,
                px: 1,
                py: 3,
                border: 0,
                outline: 0,
                resize: 'none',
                overflowY: 'auto',
                bgcolor: 'transparent',
                color: 'text.primary',
                font: 'inherit',
                fontSize: '1rem',
                lineHeight: language === 'ta' ? '2rem' : '1.5rem',
                fontFamily: language === 'ta' ? '"Noto Sans Tamil", sans-serif' : 'inherit',
                '&:disabled': { color: 'text.disabled' },
                // The hint stays on one line on narrow phones (truncated, never wrapped).
                '&::placeholder': {
                  color: 'text.secondary',
                  opacity: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              }}
            />
          )}
          {/* Tap to talk, tap again to finish: the icon and its container show the state. No
              tooltip on touch, which would pop over the composer on a long press. */}
          <Tooltip
            title={
              voice.state === 'recording'
                ? t.finishTalking
                : voice.state === 'idle'
                  ? t.talk
                  : t.stopVoice
            }
            disableTouchListener
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
                  else if (voice.state === 'idle') void voice.start(session.current)
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

function Bubble({
  message,
  you,
  coach,
}: {
  message: { role: 'user' | 'assistant'; text: string }
  you: string
  coach: string
}) {
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
