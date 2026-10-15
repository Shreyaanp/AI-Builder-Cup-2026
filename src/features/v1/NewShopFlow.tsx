import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  Leaf,
  LocateFixed,
  Mic,
  MicOff,
  SkipForward,
  Sparkles,
  Store,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { gsap } from 'gsap'
import { visuallyHidden } from '@mui/utils'
import { chatBubbleStyle } from '../coach/bubbleStyle'
import { RateLimitError, streamCoach } from '../../api/stream'
import type { CoachEvent } from '../../api/stream'
import { useIdentity } from '../../auth/useIdentity'
import { useLocale } from '../../state/hooks'
import { chalkWrite, useChalkTimeline } from '../../design/chalkMotion'
import { enterRise, HAND_FONT, shape } from '../../design/theme'
import { discoverCopy } from '../discover/strings'
import { HoursList } from '../shop/Hours'
import { useShopCopy } from '../shop/strings'
import { unitLabel } from '../shop/units'
import { ApiError } from './api'
import type { Business, PhotoResult, Product, Proposal } from './api'
import { LocationPin } from './CurrentLocation'
import { readablePlace, useMeasureLocation, type OwnerLocation } from './location'
import { FactList } from './FactList'
import { defaultCurrency, formatPrice, toMinor } from './format'
import { NewShopReady } from './NewShopStage'
import { useNewShopCopy } from './newShopCopy'
import { factEntries } from './shopProgress'
import { useCopy } from './strings'
import { useVoice } from './useVoice'
import { useWorkspace } from './workspaceContext'
import type { GalleryPhoto } from './screens/CoachScreen'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** With no answer this long after the coach has spoken, the coach carries on by itself. */
const SILENCE_MS = 9_000
/** It does so at most this many times in a row, then waits for the owner. */
const MAX_NUDGES = 2
const EMPTY_BUSINESS: Business['fields'] = {
  name: '',
  category: '',
  location: '',
  hours: '',
  phone: '',
}

type Draft = { business: Business['fields'] | null; products: Product[] }
type Line =
  | { id: string; role: 'coach'; text: string }
  | { id: string; role: 'owner'; text: string; photo?: string }
  | { id: string; role: 'action'; title: string; items: string[] }
type NewLine = Line extends infer L ? (L extends Line ? Omit<L, 'id'> : never) : never

/** Live transcripts arrive in pieces, sometimes repeated in full. */
function mergeTranscript(current: string, next: string) {
  if (!current.trim()) return next
  if (next.trim().startsWith(current.trim())) return next
  if (current.trim().endsWith(next.trim())) return current
  return current + next
}

const filled = (value: unknown) =>
  value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length)

/** The coach's proposals add to the draft; an empty value never erases what the owner said. */
function mergeDraft(previous: Draft, snapshot: Proposal['snapshot']): Draft {
  const products = new Map(
    previous.products.map((p) => [`${p.name.toLocaleLowerCase()}|${p.unit}`, p]),
  )
  snapshot.products.forEach((p) => products.set(`${p.name.toLocaleLowerCase()}|${p.unit}`, p))
  let business = previous.business
  if (snapshot.business) {
    const merged: Record<string, unknown> = { ...(previous.business ?? snapshot.business) }
    for (const [key, value] of Object.entries(snapshot.business))
      if (filled(value)) merged[key] = value
    business = merged as unknown as Business['fields']
  }
  return { business, products: [...products.values()] }
}

/** What changed between two drafts, as the lines of the action card shown in the chat. */
function useDescribe() {
  const t = useCopy()
  const f = useNewShopCopy()
  return (before: Draft, after: Draft, fromPhoto = false) => {
    const items: string[] = []
    const a = before.business ?? EMPTY_BUSINESS
    const b = after.business
    if (b) {
      for (const key of ['name', 'category', 'location', 'hours', 'phone'] as const)
        if (
          b[key] &&
          b[key] !== a[key] &&
          !(key === 'location' && b.lat != null && b.lat !== a.lat)
        )
          items.push(`${t.fields[key]}: ${b[key]}`)
      if (b.description && b.description !== a.description) items.push(f.described)
      if (
        b.weekly_hours?.length &&
        JSON.stringify(b.weekly_hours) !== JSON.stringify(a.weekly_hours) &&
        !b.hours
      )
        items.push(t.fields.hours)
      if (b.lat != null && (b.lat !== a.lat || b.lng !== a.lng))
        items.push(f.locationSaved(readablePlace(b, f)))
      const old = new Map(factEntries(a, t).map((entry) => [entry.key, entry.value]))
      for (const entry of factEntries(b, t))
        if (old.get(entry.key) !== entry.value) items.push(`${entry.label}: ${entry.value}`)
    }
    const known = new Set(before.products.map((p) => `${p.name.toLocaleLowerCase()}|${p.unit}`))
    const added = after.products.filter(
      (p) => !known.has(`${p.name.toLocaleLowerCase()}|${p.unit}`),
    )
    if (fromPhoto && after.products.length > before.products.length)
      items.unshift(f.menuRead(added.length))
    else if (added.length) items.push(`${t.products}: ${added.map((p) => p.name).join(', ')}`)
    return items
  }
}

export function NewShopFlow({
  setGalleryPhoto,
}: {
  setGalleryPhoto: (photo: GalleryPhoto | null) => void
}) {
  const ws = useWorkspace()
  const roles = useTheme().material
  return (
    <Box
      component="main"
      id="main"
      tabIndex={-1}
      data-testid="new-shop-flow"
      sx={{ minHeight: '100dvh', bgcolor: roles.surface, outline: 'none' }}
    >
      {ws.newShopReady ? (
        <NewShopReady />
      ) : (
        ws.creatingShop && <Journey setGalleryPhoto={setGalleryPhoto} />
      )}
    </Box>
  )
}

/** Hero, conversation and review share one draft; leaving the flow discards it. */
function Journey({ setGalleryPhoto }: { setGalleryPhoto: (photo: GalleryPhoto | null) => void }) {
  const t = useCopy()
  const f = useNewShopCopy()
  const ws = useWorkspace()
  const { api } = ws
  const identity = useIdentity()
  const language = useLocale()
  const roles = useTheme().material
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const describe = useDescribe()
  const phase = ws.newShopPhase

  const [lines, setLines] = useState<Line[]>([])
  const [live, setLiveText] = useState('')
  const liveRef = useRef('')
  const [draft, setDraftState] = useState<Draft>({ business: null, products: [] })
  const draftRef = useRef(draft)
  // The last sealed server proposal; reused for review when nothing changed since.
  const [sealed, setSealed] = useState<Proposal | null>(null)
  const [ownerLocation, setOwnerLocation] = useState<OwnerLocation | null>(null)
  const [photoNotes, setPhotoNotes] = useState<string[]>([])
  const photoFile = useRef<File | null>(null)
  const [review, setReview] = useState<Proposal | null>(null)
  const [busy, setBusyState] = useState<'idle' | 'reply' | 'photo' | 'review'>('idle')
  const busyRef = useRef(busy)
  const [note, setNoteState] = useState('')
  const noteRef = useRef('')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(!ws.speakReplies)
  const mutedRef = useRef(muted)
  const [ttsText, setTtsText] = useState('')
  const session = useRef<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const started = useRef(false)
  const startSent = useRef(false)
  const greeted = useRef(false)
  const wantVoice = useRef(false)
  // A turn sent into the live voice session that has not been answered yet.
  const pending = useRef<string | null>(null)
  const ownerTurnOpen = useRef(false)
  const silence = useRef<number | undefined>(undefined)
  const nudges = useRef(0)
  const speaking = useRef<HTMLAudioElement | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  // The live voice session, for handlers declared before it (set after each render).
  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null)

  const setLive = (next: string | ((current: string) => string)) => {
    liveRef.current = typeof next === 'function' ? next(liveRef.current) : next
    setLiveText(liveRef.current)
  }
  const setDraft = (next: Draft) => {
    draftRef.current = next
    setDraftState(next)
  }
  const setBusy = (next: typeof busy) => {
    busyRef.current = next
    setBusyState(next)
  }
  const setNote = (next: string) => {
    noteRef.current = next
    setNoteState(next)
  }
  const add = (line: NewLine) =>
    setLines((items) => [...items, { ...line, id: crypto.randomUUID() } as Line].slice(-80))

  function clearSilence() {
    window.clearTimeout(silence.current)
  }
  function armSilence(extra = 0) {
    clearSilence()
    if (nudges.current >= MAX_NUDGES) return
    silence.current = window.setTimeout(onSilence, SILENCE_MS + extra)
  }
  // No answer: the coach responds in the chat anyway (a suggestion or a default) and moves on.
  function onSilence() {
    if (busyRef.current !== 'idle' || noteRef.current.trim() || document.hidden) {
      armSilence()
      return
    }
    nudges.current += 1
    void say(f.silence)
  }

  function silenceAudio() {
    speaking.current?.pause()
    speaking.current = null
    if ('speechSynthesis' in window) speechSynthesis.cancel()
  }
  function stopSpeaking() {
    silenceAudio()
    setTtsText('')
  }
  // The coach's text replies read aloud (natural Google voice; the phone's voice otherwise).
  async function speak(text: string) {
    stopSpeaking()
    setTtsText(text)
    const done = (resolve: () => void) => () => {
      setTtsText((current) => (current === text ? '' : current))
      resolve()
    }
    try {
      const response = await api<Response>('/tts', {
        method: 'POST',
        body: JSON.stringify({ text, language }),
        raw: true,
      })
      if (response.status === 200) {
        const url = URL.createObjectURL(await response.blob())
        const audio = new Audio(url)
        speaking.current = audio
        await new Promise<void>((resolve) => {
          const finish = done(resolve)
          audio.onended = audio.onpause = () => {
            URL.revokeObjectURL(url)
            finish()
          }
          audio.play().catch(finish)
        })
        return
      }
    } catch {
      // Fall through to on-device speech.
    }
    if (!('speechSynthesis' in window) || mutedRef.current) {
      setTtsText('')
      return
    }
    await new Promise<void>((resolve) => {
      const finish = done(resolve)
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = language
      utterance.onend = utterance.onerror = finish
      speechSynthesis.speak(utterance)
      // Some devices never report the end of speech.
      window.setTimeout(finish, 1500 + text.length * 70)
    })
  }

  /** The coach's turn is in: it joins the chat, is spoken, and the silence clock starts. */
  function commitCoach(finished: boolean) {
    const text = liveRef.current.trim()
    setLive('')
    ownerTurnOpen.current = false
    if (text) add({ role: 'coach', text })
    if (!finished) return
    pending.current = null
    if (startSent.current) greeted.current = true
    setBusy('idle')
    const live = voiceRef.current
    if (live && live.state !== 'idle') armSilence(live.playbackRemaining() * 1000)
    else if (text && !mutedRef.current) void speak(text).then(() => armSilence())
    else armSilence()
  }
  function hearOwner(text: string) {
    clearSilence()
    nudges.current = 0
    const open = ownerTurnOpen.current
    ownerTurnOpen.current = true
    setLines((items) => {
      const last = items.at(-1)
      if (open && last?.role === 'owner' && !last.photo)
        return [...items.slice(0, -1), { ...last, text: mergeTranscript(last.text, text) }]
      return [...items, { id: crypto.randomUUID(), role: 'owner' as const, text }].slice(-80)
    })
  }
  function applyProposal(proposal: Proposal) {
    setSealed(proposal)
    const before = draftRef.current
    const after = mergeDraft(before, proposal.snapshot)
    setDraft(after)
    const items = describe(before, after)
    if (items.length) add({ role: 'action', title: f.added, items })
  }
  function receive(event: CoachEvent) {
    if (event.kind === 'ready' && event.session_id) session.current = event.session_id
    if (event.kind === 'delta') setLive((current) => current + (event.text ?? ''))
    if (event.kind === 'reply') setLive(event.text ?? '')
    if (event.kind === 'output_transcript')
      setLive((current) => mergeTranscript(current, event.text ?? ''))
    if (event.kind === 'input_transcript' && event.text?.trim()) hearOwner(event.text)
    if (event.kind === 'proposal') applyProposal(event.data as unknown as Proposal)
    if (event.kind === 'interrupted') commitCoach(false)
    if (event.kind === 'turn_complete') commitCoach(true)
  }

  const voice = useVoice(null, receive, draft, {
    // The coach speaks first: the opening goes out as soon as the live session is ready.
    onReady: () => {
      if (startSent.current) return
      startSent.current = true
      setBusy('reply')
      if (voiceRef.current?.sendText(f.start, draftRef.current)) pending.current = f.start
    },
  })
  useEffect(() => {
    voiceRef.current = voice
  })
  const { muted: voiceMuted, toggleMute, stop: stopVoice } = voice
  useEffect(() => {
    if (voiceMuted !== muted) toggleMute()
  }, [muted, voiceMuted, toggleMute])

  /** Any turn: in the live voice session when one is open, otherwise a streamed text turn. */
  async function say(message: string) {
    clearSilence()
    setError('')
    if (voiceRef.current?.sendText(message, draftRef.current)) {
      pending.current = message
      setBusy('reply')
      return
    }
    await sendText(message)
  }
  async function sendText(message: string) {
    stopSpeaking()
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setBusy('reply')
    setLive('')
    try {
      await streamCoach(
        {
          message,
          language,
          currency: defaultCurrency(),
          session_id: session.current,
          business_id: null,
          new_shop: true,
          new_shop_draft: draftRef.current,
        },
        abort.signal,
        receive,
        identity.getToken,
      )
      if (controller.current === abort && liveRef.current.trim()) commitCoach(true)
    } catch (cause) {
      if (!abort.signal.aborted) {
        setLive('')
        setError(cause instanceof RateLimitError ? t.rateLimited : t.replyFailed)
      }
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setBusy('idle')
      }
    }
  }

  const canVoice =
    typeof window !== 'undefined' &&
    Boolean(navigator.mediaDevices) &&
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined'
  function begin() {
    started.current = true
    ws.setNewShopPhase('chat')
    if (canVoice) {
      wantVoice.current = true
      void voice.start()
    } else {
      startSent.current = true
      void sendText(f.start)
    }
  }

  // Voice ended (time limit, microphone refused, connection lost): the chat carries on by text,
  // and if the greeting never arrived the coach still speaks first.
  const voiceState = voice.state
  const voiceEnded = useEffectEvent(() => {
    if (!started.current) return
    // A refused microphone is not retried by itself; the mic button still offers it.
    if (voice.error) wantVoice.current = false
    const unanswered = pending.current
    pending.current = null
    if (busyRef.current === 'reply' && !controller.current) {
      setLive('')
      setBusy('idle')
    }
    if (ws.newShopPhase !== 'chat') return
    // A turn the live session never answered goes again by text, so nothing the owner said is lost.
    if (unanswered) void sendText(unanswered)
    else if (!startSent.current) {
      startSent.current = true
      void sendText(f.start)
    }
  })
  useEffect(() => {
    if (voiceState === 'idle') voiceEnded()
  }, [voiceState])

  // Review is a page of its own: nobody listens there. Coming back resumes the voice.
  const enterPhase = useEffectEvent((next: typeof phase) => {
    if (next !== 'chat') {
      clearSilence()
      silenceAudio()
      stopVoice()
    } else if (started.current && wantVoice.current && greeted.current) {
      void voice.start(session.current)
    }
  })
  useEffect(() => {
    enterPhase(phase)
  }, [phase])
  useEffect(
    () => () => {
      window.clearTimeout(silence.current)
      controller.current?.abort()
      speaking.current?.pause()
      if ('speechSynthesis' in window) speechSynthesis.cancel()
    },
    [],
  )
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: reducedMotion ? 'instant' : 'smooth' })
  }, [lines, live, reducedMotion])
  useLayoutEffect(() => {
    const field = messageInput.current
    if (!field) return
    field.style.height = '48px'
    if (note) field.style.height = `${Math.max(48, field.scrollHeight)}px`
  }, [note])

  async function submit() {
    const text = note.trim()
    if (!text || busy !== 'idle') return
    setNote('')
    nudges.current = 0
    ownerTurnOpen.current = false
    add({ role: 'owner', text })
    await say(text)
  }
  function skip() {
    if (busy !== 'idle') return
    nudges.current = 0
    add({ role: 'owner', text: f.skip })
    void say(f.silence)
  }

  async function uploadPhoto(file: File) {
    if (!PHOTO_TYPES.includes(file.type) || file.size > 20_000_000) {
      setError(t.photoType)
      return
    }
    clearSilence()
    nudges.current = 0
    stopSpeaking()
    setError('')
    setBusy('photo')
    add({ role: 'owner', text: f.photo, photo: URL.createObjectURL(file) })
    try {
      const result = await api<PhotoResult>(`/photos?currency=${defaultCurrency()}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type },
        signal: AbortSignal.timeout(60_000),
      })
      const before = draftRef.current
      let after = before
      if (result.proposal) {
        setSealed(result.proposal)
        after = mergeDraft(before, result.proposal.snapshot)
      } else {
        const currency = before.business?.currency ?? defaultCurrency()
        const products = (result.extraction.products ?? [])
          .filter((p) => p.price != null)
          .map((p) => ({ ...p, price: toMinor(p.price!, currency), stock: null }))
        after = mergeDraft(before, {
          kind: 'inventory',
          business_id: '',
          revision: 0,
          business: null,
          products,
        })
      }
      setDraft(after)
      if (['storefront', 'signboard', 'menu', 'price_list'].includes(result.photo_kind))
        photoFile.current = file
      setPhotoNotes(result.extraction.uncertain.slice(0, 5))
      const items = describe(before, after, true)
      setBusy('idle')
      if (!items.length) {
        add({ role: 'coach', text: t.photoNothing })
        armSilence()
        return
      }
      add({ role: 'action', title: f.added, items })
      // In plain words for the coach (no "label: value" pairs it could mistake for answers).
      const read = [
        after.business?.name,
        after.business?.category,
        ...after.products.slice(0, 12).map((p) => p.name),
      ].filter(Boolean)
      await say(f.photoNote(read.join(', ')))
    } catch (cause) {
      setBusy('idle')
      const code = cause instanceof ApiError ? cause.code : ''
      add({
        role: 'coach',
        text:
          cause instanceof ApiError && cause.status === 429
            ? t.rateLimited
            : code === 'PHOTO_BLOCKED' || code === 'NOT_BUSINESS_PHOTO'
              ? t.photoRefused
              : t.photoFailed,
      })
    } finally {
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  const location = useMeasureLocation(async (point, signal) => {
    const before = draftRef.current
    // The measured point is sealed through the normal proposal path, which adds a readable label.
    const pinned = await api<Proposal>('/proposals', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        kind: 'business',
        business_id: null,
        revision: 0,
        business: before.business ?? EMPTY_BUSINESS,
        products: before.products,
        owner_location: point,
      }),
    })
    signal.throwIfAborted()
    setOwnerLocation(point)
    applyProposal(pinned)
    const business = draftRef.current.business
    if (business) await say(f.locationNote(readablePlace(business, f)))
  })
  async function shareLocation() {
    clearSilence()
    nudges.current = 0
    // Why, before the phone asks for permission.
    add({ role: 'coach', text: t.locationReason })
    const failed = await location.locate()
    if (failed) {
      add({ role: 'coach', text: failed })
      armSilence()
    }
  }

  async function openReview() {
    const current = draftRef.current
    if (!current.business?.name || busy !== 'idle') return
    setBusy('review')
    setError('')
    try {
      const unchanged =
        sealed &&
        JSON.stringify(sealed.snapshot.business) === JSON.stringify(current.business) &&
        JSON.stringify(sealed.snapshot.products) === JSON.stringify(current.products)
      const proposal =
        !ownerLocation && unchanged
          ? sealed
          : await api<Proposal>('/proposals', {
              method: 'POST',
              body: JSON.stringify({
                kind: 'business',
                business_id: null,
                revision: 0,
                ...current,
                owner_location: ownerLocation,
              }),
            })
      setReview({ ...proposal, photo_notes: photoNotes, new_shop: true })
      ws.setNewShopPhase('review')
    } catch {
      setError(t.actionFailed)
    } finally {
      setBusy('idle')
    }
  }

  if (phase === 'hero') return <Hero onBegin={begin} onCancel={ws.cancelNewShop} />
  if (phase === 'review' && review)
    return (
      <Review
        proposal={review}
        onChange={setReview}
        onBack={() => window.history.back()}
        onOpened={async (businessId) => {
          if (photoFile.current) setGalleryPhoto({ file: photoFile.current, businessId })
          await ws.finishNewShop(businessId)
        }}
      />
    )

  const live_ = voice.state !== 'idle'
  const lastCoach = [...lines].reverse().find((line) => line.role === 'coach')
  const caption = live || ttsText
  const status =
    busy === 'photo'
      ? t.checkingPhoto
      : location.busy
        ? t.locating
        : busy === 'reply'
          ? t.speaking
          : voice.state === 'recording'
            ? f.listening
            : voice.state === 'idle'
              ? f.micOff
              : t.connectionReconnecting
  const idle = busy === 'idle' && !location.busy
  const canSend = Boolean(note.trim()) && idle

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        maxWidth: 760,
        mx: 'auto',
        px: { xs: 4, sm: 6 },
        pt: 'env(safe-area-inset-top)',
        pb: 'calc(12px + env(safe-area-inset-bottom))',
        ...enterRise,
      }}
    >
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56 }}>
        <Tooltip title={t.cancel}>
          <IconButton aria-label={t.cancel} onClick={ws.cancelNewShop} sx={{ ml: -1 }}>
            <X size={22} />
          </IconButton>
        </Tooltip>
        <Typography component="h1" variant="titleMedium" sx={{ flex: 1 }}>
          {t.newShopMode}
        </Typography>
        <Tooltip title={muted ? f.unmute : f.mute}>
          <IconButton
            aria-label={muted ? f.unmute : f.mute}
            onClick={() => {
              mutedRef.current = !muted
              if (!muted) stopSpeaking()
              setMuted(!muted)
            }}
          >
            {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </IconButton>
        </Tooltip>
      </Box>

      <ShopSoFar draft={draft} busy={!idle} onReview={() => void openReview()} />

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', py: 2 }}>
        <Box role="log" aria-live="polite" aria-label={t.navCoach}>
          <Stack component="ol" spacing={3} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {lines.map((line) => (
              <ChatLine key={line.id} line={line} />
            ))}
            {busy === 'reply' && !live && (
              <Box component="li" sx={{ pl: 6 }}>
                <CircularProgress size={20} aria-label={t.speaking} />
              </Box>
            )}
          </Stack>
        </Box>
        <div ref={end} />
      </Box>

      {/* Live captions: what the coach is saying right now, word by word when it streams. */}
      <Box
        data-testid="captions"
        aria-hidden="true"
        sx={{
          minHeight: 56,
          px: 2,
          py: 1.5,
          mb: 1.5,
          borderRadius: `${shape.lg}px`,
          bgcolor: roles.surfaceContainerHighest,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 10,
            height: 10,
            flexShrink: 0,
            borderRadius: '50%',
            bgcolor: voice.state === 'recording' && !caption ? roles.primary : roles.outline,
            '@keyframes micPulse': { '50%': { transform: 'scale(1.6)', opacity: 0.5 } },
            animation:
              voice.state === 'recording' && !caption
                ? 'micPulse 1.4s ease-in-out infinite'
                : 'none',
          }}
        />
        <Typography
          variant={caption ? 'bodyLarge' : 'labelLarge'}
          color={caption ? 'text.primary' : 'text.secondary'}
          sx={{
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {caption ? (
            <>
              <Box component="span" sx={visuallyHidden}>
                {f.captions}:{' '}
              </Box>
              {caption.trim()}
            </>
          ) : (
            status
          )}
        </Typography>
      </Box>
      <Typography role="status" sx={visuallyHidden}>
        {status}
      </Typography>

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Chip
          icon={<Camera size={18} />}
          label={f.photo}
          variant="outlined"
          disabled={!idle}
          onClick={() => photoInput.current?.click()}
          sx={{ height: 40, px: 0.5, '& .MuiChip-icon': { color: roles.primary } }}
        />
        <Chip
          icon={location.busy ? <CircularProgress size={16} /> : <LocateFixed size={18} />}
          label={location.busy ? t.locating : f.location}
          variant="outlined"
          disabled={!idle}
          onClick={() => void shareLocation()}
          sx={{ height: 40, px: 0.5, '& .MuiChip-icon': { color: roles.primary } }}
        />
        <Chip
          icon={<SkipForward size={18} />}
          label={f.skip}
          variant="outlined"
          disabled={!idle || !lastCoach}
          onClick={skip}
          sx={{ height: 40, px: 0.5, '& .MuiChip-icon': { color: roles.primary } }}
        />
      </Stack>
      <input
        ref={photoInput}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) void uploadPhoto(file)
        }}
      />

      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
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
        <Tooltip title={live_ ? f.micStop : f.micOn} disableTouchListener>
          <IconButton
            aria-label={live_ ? f.micStop : f.micOn}
            aria-pressed={live_}
            onClick={() => {
              if (live_) {
                wantVoice.current = false
                stopVoice()
              } else {
                wantVoice.current = true
                void voice.start(session.current)
              }
            }}
            sx={
              live_
                ? {
                    bgcolor: roles.primaryContainer,
                    color: roles.onPrimaryContainer,
                    '&:hover': { bgcolor: roles.primaryContainer },
                  }
                : undefined
            }
          >
            {live_ ? <Mic size={22} /> : <MicOff size={22} />}
          </IconButton>
        </Tooltip>
        <Box
          component="textarea"
          ref={messageInput}
          rows={1}
          name="message"
          autoComplete="off"
          value={note}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setNote(event.target.value)
            if (event.target.value.trim()) clearSilence()
          }}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              !matchMedia('(pointer: coarse)').matches
            ) {
              event.preventDefault()
              void submit()
            }
          }}
          placeholder={t.messagePlaceholder}
          aria-label={t.message}
          maxLength={2000}
          sx={{
            flex: 1,
            minWidth: 0,
            boxSizing: 'border-box',
            height: '48px',
            maxHeight: 'calc(5 * 1.5rem + 24px)',
            m: 0,
            px: 1,
            py: 1.5,
            border: 0,
            outline: 0,
            resize: 'none',
            overflowY: 'auto',
            bgcolor: 'transparent',
            color: 'text.primary',
            font: 'inherit',
            fontSize: '1rem',
            lineHeight: '1.5rem',
            '&::placeholder': {
              color: 'text.secondary',
              opacity: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          }}
        />
        <IconButton
          type="submit"
          onMouseDown={(event) => event.preventDefault()}
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
      </Box>
    </Box>
  )
}

/** The big welcome: a shop drawn in chalk, the title written out, then one way in. */
function Hero({ onBegin, onCancel }: { onBegin: () => void; onCancel: () => void }) {
  const t = useCopy()
  const f = useNewShopCopy()
  const roles = useTheme().material
  const root = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  useChalkTimeline(root, () => {
    const strokes = gsap.utils.toArray<SVGPathElement>('[data-hero-stroke]')
    strokes.forEach((path) => {
      const length = path.getTotalLength()
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })
    })
    gsap
      .timeline()
      .to(strokes, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut', stagger: 0.14 })
      .from(
        '[data-hero-title]',
        { clipPath: 'inset(0 100% 0 0)', duration: 0.8, ease: 'power2.out' },
        '-=0.6',
      )
      .from(
        '[data-hero-spark]',
        { scale: 0, rotate: -40, opacity: 0, duration: 0.45, stagger: 0.1, ease: 'back.out(2.2)' },
        '-=0.4',
      )
      .from('[data-hero-rise]', { opacity: 0, y: 18, duration: 0.5, stagger: 0.12 }, '-=0.3')
  })
  return (
    <Box
      ref={root}
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        px: { xs: 4, sm: 8 },
        pt: 'env(safe-area-inset-top)',
        pb: 'calc(24px + env(safe-area-inset-bottom))',
      }}
    >
      <Box sx={{ minHeight: 56, display: 'flex', alignItems: 'center' }}>
        <Tooltip title={t.cancel}>
          <IconButton aria-label={t.cancel} onClick={onCancel} sx={{ ml: -1 }}>
            <X size={22} />
          </IconButton>
        </Tooltip>
      </Box>
      <Stack
        sx={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          maxWidth: 640,
          mx: 'auto',
          gap: 3,
        }}
      >
        <Box aria-hidden="true" sx={{ position: 'relative', color: roles.primary }}>
          <Box
            data-hero-spark
            sx={{ position: 'absolute', top: -6, left: -18, color: roles.tertiary }}
          >
            <Sparkles size={28} />
          </Box>
          <Box
            data-hero-spark
            sx={{ position: 'absolute', top: 18, right: -22, color: roles.secondary }}
          >
            <Sparkles size={22} />
          </Box>
          <Box
            component="svg"
            viewBox="0 0 160 120"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            sx={{ width: { xs: 200, md: 260 }, height: 'auto', display: 'block' }}
          >
            <path data-hero-stroke d="M28 49L39 22L123 20L135 47" />
            <path
              data-hero-stroke
              d="M28 49Q39 62 50 49Q61 62 72 49Q83 61 94 49Q105 61 116 49Q126 60 135 47"
            />
            <path data-hero-stroke d="M52 25L50 49M75 24L72 49M97 23L94 49M117 23L116 49" />
            <path data-hero-stroke d="M32 52L34 96L130 94L132 52" />
            <path data-hero-stroke d="M48 70L75 69L75 86L48 87Z" />
            <path data-hero-stroke d="M94 96L93 68L115 68L117 95M105 80L108 80" />
            <path data-hero-stroke d="M22 102L141 100" />
            <path data-hero-stroke d="M54 66L58 58L66 66M52 110Q80 116 108 109" />
            <path data-hero-stroke d="M12 28L5 21M144 19L151 12M17 66L8 69M67 12Q80 2 94 11" />
          </Box>
        </Box>
        <Typography
          ref={heading}
          tabIndex={-1}
          component="h1"
          data-hero-title
          sx={{
            fontFamily: HAND_FONT,
            fontSize: { xs: '3.2rem', md: '4.6rem' },
            lineHeight: 1.05,
            textWrap: 'balance',
            color: roles.onSurface,
            '&:focus': { outline: 'none' },
          }}
        >
          {f.title}
        </Typography>
        <Typography
          data-hero-rise
          variant="bodyLarge"
          color="text.secondary"
          sx={{ maxWidth: 440 }}
        >
          {f.heroBody}
        </Typography>
        <Button
          data-hero-rise
          variant="contained"
          size="large"
          startIcon={<Mic size={22} />}
          onClick={onBegin}
          sx={{ minHeight: 56, px: 5, mt: 2, borderRadius: `${shape.full}px`, fontSize: '1.05rem' }}
        >
          {f.begin}
        </Button>
      </Stack>
    </Box>
  )
}

/** The shop, filling in while the owner talks. */
function ShopSoFar({
  draft,
  busy,
  onReview,
}: {
  draft: Draft
  busy: boolean
  onReview: () => void
}) {
  const t = useCopy()
  const f = useNewShopCopy()
  const roles = useTheme().material
  const business = draft.business
  const details = [
    business?.category,
    draft.products.length ? t.itemCount(draft.products.length) : null,
    business && business.lat != null ? readablePlace(business, f) : business?.location,
    business?.hours,
    ...(business ? factEntries(business, t).map((entry) => entry.value) : []),
  ].filter((value): value is string => Boolean(value))
  return (
    <Box
      component="section"
      aria-label={f.soFar}
      data-testid="shop-so-far"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 3,
        rowGap: 2,
        p: 3,
        borderRadius: `${shape.lg}px`,
        bgcolor: roles.surfaceContainer,
        border: `1.5px dashed ${roles.outlineVariant}`,
      }}
    >
      <Avatar
        sx={{ bgcolor: roles.primaryContainer, color: roles.onPrimaryContainer }}
        aria-hidden="true"
      >
        <Store size={22} />
      </Avatar>
      <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
        <Typography variant="labelMedium" color="text.secondary">
          {f.soFar}
        </Typography>
        <Typography
          key={business?.name}
          component="p"
          sx={{
            fontFamily: HAND_FONT,
            fontSize: { xs: '1.6rem', sm: '1.85rem' },
            lineHeight: 1.15,
            overflowWrap: 'anywhere',
            color: business?.name ? 'text.primary' : 'text.secondary',
            ...(business?.name ? chalkWrite : {}),
          }}
        >
          {business?.name || f.unnamed}
        </Typography>
        {details.length > 0 && (
          <Typography
            variant="bodySmall"
            color="text.secondary"
            sx={{ mt: 0.5, overflowWrap: 'anywhere' }}
          >
            {details.join(' · ')}
          </Typography>
        )}
      </Box>
      {business?.name && (
        <Button
          variant="contained"
          disabled={busy}
          onClick={onReview}
          sx={{ flexShrink: 0, ml: 'auto' }}
        >
          {f.review}
        </Button>
      )}
    </Box>
  )
}

function ChatLine({ line }: { line: Line }) {
  const t = useCopy()
  const f = useNewShopCopy()
  const roles = useTheme().material
  if (line.role === 'owner')
    return (
      <Box component="li" sx={{ display: 'flex', justifyContent: 'flex-end', ...enterRise }}>
        <Box sx={chatBubbleStyle(roles)}>
          <Typography component="span" sx={visuallyHidden}>
            {t.you}:{' '}
          </Typography>
          {line.photo ? (
            <Box
              component="img"
              src={line.photo}
              alt={f.photo}
              sx={{
                display: 'block',
                maxWidth: 200,
                maxHeight: 200,
                borderRadius: `${shape.md}px`,
              }}
            />
          ) : (
            <Typography
              variant="bodyLarge"
              sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {line.text}
            </Typography>
          )}
        </Box>
      </Box>
    )
  if (line.role === 'action')
    return (
      <Box
        component="li"
        data-testid="agent-action"
        sx={{
          ml: 6,
          p: 2,
          borderRadius: `${shape.md}px`,
          borderInlineStart: `3px solid ${roles.primary}`,
          bgcolor: roles.surfaceContainerLow,
          ...enterRise,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: roles.primary }}>
          <Check size={18} aria-hidden="true" />
          <Typography variant="labelLarge">{line.title}</Typography>
        </Stack>
        <Box component="ul" sx={{ m: 0, mt: 1, pl: 3.5 }}>
          {line.items.map((item) => (
            <Typography
              component="li"
              variant="bodyMedium"
              key={item}
              sx={{ overflowWrap: 'anywhere' }}
            >
              {item}
            </Typography>
          ))}
        </Box>
      </Box>
    )
  return (
    <Stack
      component="li"
      direction="row"
      spacing={2}
      sx={{ alignItems: 'flex-start', ...enterRise }}
    >
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
          {t.coach}:{' '}
        </Typography>
        <Typography variant="bodyLarge" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {line.text}
        </Typography>
      </Box>
    </Stack>
  )
}

/** The one sealed review, as a page of the flow. Saving happens only from its one button. */
function Review({
  proposal,
  onChange,
  onBack,
  onOpened,
}: {
  proposal: Proposal
  onChange: (proposal: Proposal) => void
  onBack: () => void
  onOpened: (businessId: string) => Promise<void>
}) {
  const t = useCopy()
  const f = useNewShopCopy()
  const ws = useWorkspace()
  const shopCopy = useShopCopy()
  const pinCopy = discoverCopy(useLocale())
  const roles = useTheme().material
  const title = useRef<HTMLHeadingElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fields = proposal.snapshot.business ?? EMPTY_BUSINESS
  const currency = fields.currency ?? defaultCurrency()
  useEffect(() => {
    title.current?.focus()
  }, [])
  async function findPin() {
    setBusy(true)
    setError('')
    try {
      const pinned = await ws.api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify({ ...proposal.snapshot, business_id: null, geocode_confirmed: true }),
      })
      onChange({ ...pinned, new_shop: true, photo_notes: proposal.photo_notes })
    } catch {
      setError(pinCopy.pinError)
    } finally {
      setBusy(false)
    }
  }
  async function open() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const receipt = await ws.api<{ business_id: string }>(`/proposals/${proposal.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ digest: proposal.digest }),
      })
      await onOpened(receipt.business_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.actionFailed)
      setBusy(false)
    }
  }
  const section = (label: string, children: ReactNode) => (
    <Box>
      <Typography component="h3" variant="titleSmall" color="text.secondary" sx={{ mb: 1 }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
  return (
    <Box
      component="section"
      aria-labelledby="new-shop-review-title"
      data-testid="new-shop-review"
      sx={{
        maxWidth: 720,
        mx: 'auto',
        px: { xs: 4, sm: 6 },
        pt: 'env(safe-area-inset-top)',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        ...enterRise,
      }}
    >
      <Box sx={{ minHeight: 56, display: 'flex', alignItems: 'center' }}>
        <Button
          startIcon={<ArrowLeft size={20} />}
          onClick={onBack}
          disabled={busy}
          sx={{ ml: -1 }}
        >
          {f.backToChat}
        </Button>
      </Box>
      <Typography
        ref={title}
        tabIndex={-1}
        id="new-shop-review-title"
        component="h1"
        sx={{
          fontFamily: HAND_FONT,
          fontSize: { xs: '2.6rem', md: '3.4rem' },
          lineHeight: 1.1,
          '&:focus': { outline: 'none' },
        }}
      >
        {f.reviewTitle}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        {t.reviewNote}
      </Typography>
      <Box
        sx={{
          border: `1px solid ${roles.outlineVariant}`,
          borderRadius: `${shape.lg}px`,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            p: { xs: 3, sm: 4 },
            bgcolor: roles.primaryContainer,
            color: roles.onPrimaryContainer,
          }}
        >
          <Typography component="h2" variant="headlineMedium" sx={{ overflowWrap: 'anywhere' }}>
            {fields.name}
          </Typography>
          {fields.category && (
            <Typography variant="bodyLarge" sx={{ mt: 1 }}>
              {fields.category}
            </Typography>
          )}
        </Box>
        <Stack spacing={3} divider={<Divider flexItem />} sx={{ p: { xs: 3, sm: 4 } }}>
          {(fields.description || fields.phone || fields.hours || fields.weekly_hours?.length) && (
            <Stack spacing={1}>
              {fields.description && (
                <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {fields.description}
                </Typography>
              )}
              {fields.phone && <Typography>{fields.phone}</Typography>}
              {fields.hours && <Typography>{fields.hours}</Typography>}
              <HoursList hours={fields.weekly_hours} />
            </Stack>
          )}
          {section(
            t.products,
            proposal.snapshot.products.length ? (
              <Stack component="ul" spacing={1.5} sx={{ p: 0, m: 0, listStyle: 'none' }}>
                {proposal.snapshot.products.map((product) => (
                  <Box
                    component="li"
                    key={product.name + product.unit}
                    sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
                  >
                    <Typography sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                      {product.name}
                    </Typography>
                    <Typography sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {formatPrice(product.price, currency)} / {unitLabel(product.unit, shopCopy)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography color="text.secondary">{t.itemCount(0)}</Typography>
            ),
          )}
          {section(
            t.fields.location,
            <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              {fields.lat != null ? (
                <LocationPin fields={fields} />
              ) : (
                <Typography color={fields.location ? 'text.primary' : 'text.secondary'}>
                  {fields.location || '—'}
                </Typography>
              )}
              {fields.pin_demo && <Typography variant="bodySmall">{pinCopy.demo}</Typography>}
              {fields.location && (fields.lat == null || fields.pin_demo) && (
                <Button disabled={busy} onClick={() => void findPin()}>
                  {pinCopy.findPin}
                </Button>
              )}
            </Stack>,
          )}
          {factEntries(fields, t).length > 0 && <FactList fields={fields} />}
        </Stack>
      </Box>
      {Boolean(proposal.photo_notes?.length) && (
        <Alert severity="info" sx={{ mt: 3 }}>
          <AlertTitle>{t.photoReviewNotes}</AlertTitle>
          {proposal.photo_notes?.map((item) => (
            <Typography key={item} variant="bodySmall">
              {item}
            </Typography>
          ))}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          mt: 'auto',
          pt: 3,
          pb: 'calc(16px + env(safe-area-inset-bottom))',
          bgcolor: roles.surface,
        }}
      >
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={busy}
          startIcon={busy ? <CircularProgress size={20} color="inherit" /> : <Store size={22} />}
          onClick={() => void open()}
          sx={{ minHeight: 56, borderRadius: `${shape.full}px` }}
        >
          {f.open}
        </Button>
      </Box>
    </Box>
  )
}
