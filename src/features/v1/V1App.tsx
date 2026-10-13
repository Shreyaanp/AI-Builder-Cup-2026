import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  Fade,
  FormControlLabel,
  IconButton,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Leaf,
  Mic,
  Plus,
  Send,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { AccountControl } from '../../auth/AccountControl'
import { useIdentity } from '../../auth/useIdentity'
import { usePreferences, usePreferencesDispatch } from '../../state/hooks'
import { streamCoach } from '../../api/stream'
import type { CoachEvent } from '../../api/stream'
import { ApiError, makeApi } from './api'
import type { Business, PhotoResult, Product, Proposal } from './api'
import { FaceDialog } from './FaceDialog'
import { useVoice } from './useVoice'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function V1App() {
  const identity = useIdentity()
  const { language } = usePreferences()
  const hi = language === 'hi'
  const [preview, setPreview] = useState(false)
  if (identity.status === 'loading')
    return (
      <Box
        role="status"
        sx={{
          minHeight: '100dvh',
          display: 'grid',
          placeContent: 'center',
          textAlign: 'center',
          gap: 3,
        }}
      >
        <Leaf size={40} aria-hidden="true" />
        <Typography variant="h4">oGoogle AI</Typography>
        <CircularProgress aria-label="Restoring your session" />
        <Typography>
          {hi ? 'आपकी बातचीत तैयार कर रहे हैं…' : 'Getting your conversation ready…'}
        </Typography>
      </Box>
    )
  if (identity.status !== 'ready' || (identity.mode === 'local' && !preview))
    return (
      <Box sx={{ maxWidth: 520, mx: 'auto', px: 3, py: 10 }}>
        <Leaf size={36} aria-hidden="true" />
        <Typography variant="h3" sx={{ mt: 4 }}>
          {hi ? 'नमस्ते।' : 'Hello.'}
        </Typography>
        <Typography variant="h5" sx={{ mt: 2 }}>
          {hi ? 'आपका व्यवसाय। एक आसान बातचीत।' : 'Your business. One easy conversation.'}
        </Typography>
        <Typography sx={{ mt: 3 }}>
          {hi
            ? 'आप जहाँ रुके थे, वहीं से आगे बढ़ें।'
            : 'Bring your business together, and pick up where you left off.'}
        </Typography>
        <AccountControl />
        {identity.mode === 'local' && (
          <>
            <Alert severity="info" sx={{ my: 3 }}>
              Local private preview. Google sign-in requires separate local Firebase configuration.
            </Alert>
            <Button variant="contained" onClick={() => setPreview(true)}>
              Continue local preview
            </Button>
          </>
        )}
        {identity.status === 'error' && (
          <Button onClick={() => location.reload()}>Retry connection</Button>
        )}
      </Box>
    )
  return <Workspace key={identity.scope} />
}

function Workspace() {
  const identity = useIdentity()
  const { language } = usePreferences()
  const dispatch = usePreferencesDispatch()
  const hi = language === 'hi'
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const api = useMemo(() => makeApi(identity.getToken), [identity.getToken])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([])
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [form, setForm] = useState<'business' | 'inventory' | null>(null)
  const [fields, setFields] = useState({
    name: '',
    category: '',
    location: '',
    hours: '',
    phone: '',
  })
  const [item, setItem] = useState({ name: '', price: '', unit: 'item', stock: '' })
  const [details, setDetails] = useState(false)
  const [face, setFace] = useState(false)
  const [spoken, setSpoken] = useState(false)
  const [mode, setMode] = useState<'offline' | 'gemini'>('offline')
  const [history, setHistory] = useState<
    { session_id: string; business_id?: string | null; updated: number }[]
  >([])
  const session = useRef<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const strip = useRef<HTMLDivElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const business = businesses.find((entry) => entry.id === active)
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const items = await api<Business[]>('/businesses', { signal })
      if (!signal?.aborted) {
        setBusinesses(items)
        setLoading(false)
      }
    },
    [api],
  )
  useEffect(() => {
    const abort = new AbortController()
    void api<Business[]>('/businesses', { signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted) setBusinesses(items)
      })
      .catch(() => {
        if (!abort.signal.aborted) setError('Start the local V1 backend to use this preview.')
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    void api<{ session_id: string; business_id?: string | null; updated: number }[]>(
      '/conversations',
      { signal: abort.signal },
    )
      .then((items) => {
        if (!abort.signal.aborted) setHistory(items)
      })
      .catch(() => undefined)
    return () => {
      abort.abort()
      controller.current?.abort()
      speechSynthesis.cancel()
    }
  }, [api])
  useEffect(() => {
    if (!active) return
    const abort = new AbortController()
    void api<Product[]>(`/businesses/${active}/inventory`, { signal: abort.signal })
      .then((items) => {
        if (!abort.signal.aborted) setProducts(items)
      })
      .catch(() => {
        if (!abort.signal.aborted) setError('Inventory could not be restored. Retry.')
      })
    return () => abort.abort()
  }, [active, api])
  function receive(event: CoachEvent) {
    if (event.kind === 'ready') {
      session.current = event.session_id ?? null
      setMode(event.mode ?? 'offline')
    }
    if (event.kind === 'delta') setReply((text) => text + (event.text ?? ''))
    if (event.kind === 'reply' || event.kind === 'output_transcript') setReply(event.text ?? '')
    if (event.kind === 'input_transcript')
      setMessages((items) => [...items, { role: 'user', text: event.text ?? '' }])
    if (event.kind === 'proposal') setProposal(event.data as unknown as Proposal)
    if (event.kind === 'workflow') {
      if (event.data?.status === 'verification_required') setFace(true)
      else setError('Review and save your business first.')
    }
  }
  const voice = useVoice(active, receive)
  function switchBusiness(id: string | null) {
    controller.current?.abort()
    controller.current = null
    voice.stop()
    speechSynthesis.cancel()
    setActive(id)
    setProducts([])
    setProposal(null)
    setMessages([])
    setReply('')
    setNote('')
    setBusy(false)
    session.current = null
  }
  async function send() {
    if (!note.trim() || busy || voice.state !== 'idle') return
    const message = note.trim()
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setReply('')
    setError('')
    let finalReply = ''
    try {
      const token = await identity.getToken()
      await streamCoach(
        { message, language, session_id: session.current, business_id: active },
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
        [
          ...items,
          { role: 'user' as const, text: message },
          { role: 'assistant' as const, text: finalReply },
        ].slice(-40),
      )
      setReply('')
      setNote('')
      if (spoken && finalReply) {
        speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(finalReply)
        utterance.lang = hi ? 'hi-IN' : 'en-IN'
        speechSynthesis.speak(utterance)
      }
      const historyItems = await api<typeof history>('/conversations')
      if (controller.current === abort) setHistory(historyItems)
    } catch {
      if (!abort.signal.aborted)
        setError(
          hi
            ? 'जवाब पूरा नहीं हुआ। आपकी बात सुरक्षित है।'
            : 'Reply did not finish. Your note is preserved.',
        )
    } finally {
      if (controller.current === abort) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  async function prepare() {
    try {
      setError('')
      const data =
        form === 'business'
          ? {
              kind: 'business',
              business_id: active,
              revision: business?.revision ?? 0,
              business: fields,
            }
          : {
              kind: 'inventory',
              business_id: active,
              revision: business?.revision ?? 0,
              products: [
                {
                  name: item.name,
                  price: Math.round(Number(item.price) * 100),
                  unit: item.unit,
                  stock: item.stock ? Number(item.stock) : null,
                },
              ],
            }
      if (form === 'inventory' && (!item.price.trim() || !Number.isFinite(Number(item.price))))
        throw new Error('Enter a price')
      const preview = await api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      setForm(null)
      setProposal(preview)
    } catch {
      setError(
        hi
          ? 'जानकारी जाँचें। ड्राफ्ट सुरक्षित है।'
          : 'Check the entered details. Your draft is preserved.',
      )
    }
  }
  async function approve() {
    if (!proposal || busy) return
    setBusy(true)
    try {
      const result = await api<{ business_id: string }>(`/proposals/${proposal.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ digest: proposal.digest }),
      })
      await reload()
      setActive(result.business_id)
      setProposal(null)
      setProducts(await api<Product[]>(`/businesses/${result.business_id}/inventory`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed. Review again.')
    } finally {
      setBusy(false)
    }
  }
  async function uploadPhoto(file: File) {
    if (busy) return
    setError('')
    if (!PHOTO_TYPES.includes(file.type) || file.size > 5_000_000) {
      setError(
        hi ? 'JPEG, PNG या WebP फोटो (5 MB तक) चुनें।' : 'Choose a JPEG, PNG or WebP up to 5 MB.',
      )
      return
    }
    setBusy(true)
    try {
      const query = active ? `?business_id=${encodeURIComponent(active)}` : ''
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
            text: result.proposal
              ? (hi
                  ? 'फोटो से जानकारी तैयार है। सहेजने से पहले जाँचें।'
                  : 'I read your photo. Review the details before saving.') +
                (notes ? ` (${notes})` : '')
              : hi
                ? 'फोटो में सहेजने लायक नई जानकारी नहीं मिली।'
                : 'I could not find new details to save in this photo.',
          },
        ].slice(-40),
      )
      if (result.proposal) setProposal(result.proposal)
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : ''
      setError(
        code === 'PHOTO_BLOCKED' || code === 'NOT_BUSINESS_PHOTO'
          ? hi
            ? 'यह फोटो इस्तेमाल नहीं की जा सकती। केवल दुकान का बोर्ड, मेनू, रेट-लिस्ट, उत्पाद या दुकान की फोटो भेजें।'
            : 'This photo can’t be used. Send only a shop signboard, menu, price list, product or storefront.'
          : hi
            ? 'फोटो जाँची नहीं जा सकी। फिर कोशिश करें।'
            : 'The photo could not be checked. Try again.',
      )
    } finally {
      setBusy(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }
  async function restore(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const data = await api<{ messages: typeof messages }>(`/conversations/${id}`)
      session.current = id
      setMessages(data.messages)
      setReply('')
    } catch {
      setError('Conversation could not be restored.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Box
      sx={{ minHeight: '100dvh', bgcolor: 'background.default', pb: 'env(safe-area-inset-bottom)' }}
    >
      <a
        href="#v1-conversation"
        style={{ position: 'absolute', left: -10000 }}
        onFocus={(event) => {
          event.currentTarget.style.left = '16px'
        }}
        onBlur={(event) => {
          event.currentTarget.style.left = '-10000px'
        }}
      >
        Skip to conversation
      </a>
      <Box
        component="header"
        sx={{
          maxWidth: 960,
          mx: 'auto',
          px: { xs: 2, sm: 4 },
          pt: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Leaf aria-hidden="true" />
        <Typography variant="h6" sx={{ flex: 1 }}>
          oGoogle AI
        </Typography>
        <TextField
          select
          size="small"
          label={hi ? 'भाषा' : 'Language'}
          value={language}
          onChange={(event) =>
            dispatch({ type: 'language', language: event.target.value as 'en' | 'hi' })
          }
        >
          <MenuItem value="en">English</MenuItem>
          <MenuItem value="hi">हिन्दी</MenuItem>
        </TextField>
      </Box>
      <Box component="main" sx={{ maxWidth: 960, mx: 'auto', px: { xs: 2, sm: 4 }, py: 3 }}>
        <AccountControl />
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="overline" sx={{ flex: 1 }}>
            {hi ? 'आपके व्यवसाय' : 'Your businesses'}
          </Typography>
          <IconButton
            aria-label="Previous businesses"
            onClick={() =>
              strip.current?.scrollBy({ left: -260, behavior: reduced ? 'instant' : 'smooth' })
            }
          >
            <ArrowLeft size={20} />
          </IconButton>
          <IconButton
            aria-label="Next businesses"
            onClick={() =>
              strip.current?.scrollBy({ left: 260, behavior: reduced ? 'instant' : 'smooth' })
            }
          >
            <ArrowRight size={20} />
          </IconButton>
        </Stack>
        <Box
          ref={strip}
          role="region"
          aria-label="Business overview"
          sx={{
            display: 'flex',
            gap: 2,
            overflowX: 'auto',
            scrollSnapType: 'x mandatory',
            pb: 2,
            mb: 3,
          }}
        >
          {loading && <Skeleton variant="rounded" width={240} height={130} />}
          {businesses.map((entry) => (
            <Card
              key={entry.id}
              variant="outlined"
              sx={{
                minWidth: 240,
                maxWidth: 300,
                flexShrink: 0,
                scrollSnapAlign: 'start',
                bgcolor: entry.id === active ? 'secondaryContainer' : 'background.paper',
                borderColor: entry.id === active ? 'primary.main' : 'divider',
              }}
            >
              <CardActionArea
                aria-label={'Open ' + entry.fields.name}
                aria-pressed={entry.id === active}
                onClick={() => {
                  switchBusiness(entry.id)
                  setDetails(true)
                }}
                sx={{ p: 3 }}
              >
                <Typography variant="h6" noWrap>
                  {entry.fields.name}
                </Typography>
                <Typography variant="body2" noWrap>
                  {entry.fields.category || (hi ? 'निजी ड्राफ्ट' : 'Private draft')}
                </Typography>
                <Chip
                  size="small"
                  label={
                    entry.registration === 'draft'
                      ? hi
                        ? 'ड्राफ्ट'
                        : 'Draft'
                      : hi
                        ? 'जाँच लंबित'
                        : 'Verification pending'
                  }
                  sx={{ mt: 2 }}
                />
              </CardActionArea>
            </Card>
          ))}
          <Button
            variant="outlined"
            startIcon={<Plus size={20} />}
            sx={{ minWidth: 180, flexShrink: 0, scrollSnapAlign: 'start', minHeight: 128 }}
            onClick={() => {
              switchBusiness(null)
              setFields({ name: '', category: '', location: '', hours: '', phone: '' })
              setForm('business')
            }}
          >
            {hi ? 'व्यवसाय जोड़ें' : 'Add business'}
          </Button>
        </Box>
        <Fade in timeout={reduced ? 0 : 180}>
          <Box
            id="v1-conversation"
            component="section"
            aria-label="Conversation"
            sx={{ maxWidth: 700, mx: 'auto' }}
          >
            <Typography variant="h4" sx={{ mb: 1 }}>
              {hi ? 'आज कैसे मदद करें?' : 'What shall we work on today?'}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {business
                ? business.fields.name
                : hi
                  ? 'एक बात से शुरू करें। हम आगे का कदम ढूँढेंगे।'
                  : 'Start with anything. We’ll find the next step together.'}
            </Typography>
            {error && (
              <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {voice.error && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {voice.error}
              </Alert>
            )}
            <Typography variant="caption" color="text.secondary">
              {mode === 'offline'
                ? hi
                  ? 'ऑफ़लाइन ADK नमूना · लाइव Gemini नहीं जुड़ा'
                  : 'Offline ADK demonstration · live Gemini not connected'
                : 'Gemini coach'}
            </Typography>
            {history.filter((entry) => (entry.business_id ?? null) === active).length > 0 && (
              <TextField
                select
                label={hi ? 'पुरानी बातचीत' : 'Resume conversation'}
                value=""
                fullWidth
                sx={{ my: 2 }}
                disabled={busy}
                onChange={(event) => {
                  void restore(event.target.value)
                }}
              >
                {history
                  .filter((entry) => (entry.business_id ?? null) === active)
                  .map((entry) => (
                    <MenuItem key={entry.session_id} value={entry.session_id}>
                      {new Date(entry.updated * 1000).toLocaleString(hi ? 'hi-IN' : 'en-IN')}
                    </MenuItem>
                  ))}
              </TextField>
            )}
            <Stack
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              spacing={2}
              sx={{ my: 3, maxHeight: '45dvh', overflowY: 'auto' }}
            >
              {messages.map((message, index) => (
                <Box
                  key={index}
                  sx={{
                    alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                    bgcolor: message.role === 'user' ? 'background.paper' : 'transparent',
                    px: message.role === 'user' ? 2 : 0,
                    py: 1,
                    maxWidth: '95%',
                    borderRadius: 3,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {message.role === 'user' ? (hi ? 'आप' : 'You') : hi ? 'साथी' : 'Coach'}
                  </Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {message.text}
                  </Typography>
                </Box>
              ))}
              {reply && (
                <Typography
                  aria-label="Coach response"
                  sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                >
                  {reply}
                </Typography>
              )}
            </Stack>
            <Box
              component="form"
              onSubmit={(event) => {
                event.preventDefault()
                void send()
              }}
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 4,
                bgcolor: 'background.paper',
              }}
            >
              <TextField
                label={hi ? 'आपकी बात' : 'Your message'}
                placeholder={
                  hi ? 'अपने व्यवसाय के बारे में बताएँ…' : 'Tell me what’s on your mind…'
                }
                multiline
                maxRows={5}
                fullWidth
                value={note}
                disabled={busy || voice.state !== 'idle'}
                onChange={(event) => setNote(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
              />
              <Stack direction="row" sx={{ mt: 1, alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  startIcon={<Mic size={20} />}
                  disabled={busy}
                  onClick={() => {
                    if (voice.state === 'recording') voice.finishRecording()
                    else if (voice.state === 'idle') void voice.start()
                    else voice.stop()
                  }}
                >
                  {voice.state === 'recording'
                    ? hi
                      ? 'रिकॉर्डिंग समाप्त करें'
                      : 'Finish recording'
                    : voice.state === 'idle'
                      ? hi
                        ? 'बोलें'
                        : 'Press to talk'
                      : hi
                        ? 'आवाज़ रोकें'
                        : 'Stop voice'}
                </Button>
                <IconButton
                  aria-label={voice.muted ? 'Unmute voice' : 'Mute voice'}
                  onClick={voice.toggleMute}
                >
                  {voice.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </IconButton>
                <Button
                  startIcon={<Camera size={20} />}
                  disabled={busy || voice.state !== 'idle'}
                  onClick={() => photoInput.current?.click()}
                >
                  {hi ? 'फोटो' : 'Photo'}
                </Button>
                <input
                  ref={photoInput}
                  type="file"
                  accept={PHOTO_TYPES.join(',')}
                  hidden
                  aria-hidden="true"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadPhoto(file)
                  }}
                />
                <Box sx={{ flex: 1 }} />
                {busy && (
                  <Button
                    startIcon={<Square size={16} />}
                    onClick={() => {
                      controller.current?.abort()
                      setBusy(false)
                    }}
                  >
                    Stop reply
                  </Button>
                )}
                <IconButton
                  aria-label={hi ? 'बात भेजें' : 'Send message'}
                  type="submit"
                  disabled={busy || !note.trim() || voice.state !== 'idle'}
                >
                  <Send size={22} />
                </IconButton>
              </Stack>
            </Box>
            <Stack
              direction="row"
              sx={{
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
                mt: 1,
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={spoken}
                    onChange={(_, checked) => {
                      setSpoken(checked)
                      if (!checked) speechSynthesis.cancel()
                    }}
                  />
                }
                label={hi ? 'टेक्स्ट जवाब पढ़ें' : 'Read text replies aloud'}
              />
              <Typography variant="caption" role="status">
                {voice.state === 'recording'
                  ? hi
                    ? 'सुन रहे हैं · अधिकतम 30 सेकंड'
                    : 'Listening · up to 30 seconds'
                  : voice.state === 'replying'
                    ? hi
                      ? 'जवाब आ रहा है…'
                      : 'Speaking reply…'
                    : ''}
              </Typography>
            </Stack>
            {business && (
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 3 }}>
                <Button startIcon={<ShieldCheck size={18} />} onClick={() => setFace(true)}>
                  {hi ? 'व्यवसाय पंजीकरण' : 'Register business'}
                </Button>
                <Button
                  startIcon={<Plus size={18} />}
                  onClick={() => {
                    setItem({ name: '', price: '', unit: 'item', stock: '' })
                    setForm('inventory')
                  }}
                >
                  {hi ? 'उत्पाद जोड़ें' : 'Add inventory'}
                </Button>
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
              Google publishing: not connected ·{' '}
              {hi ? 'फोटो/वीडियो सुरक्षित नहीं रखे जाते' : 'Face capture media is not retained'}
            </Typography>
          </Box>
        </Fade>
      </Box>
      <Drawer anchor="right" open={details} onClose={() => setDetails(false)}>
        <Box sx={{ width: 'min(420px, 100vw)', p: 3 }}>
          <Stack direction="row" sx={{ alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              {hi ? 'व्यवसाय विवरण' : 'Business details'}
            </Typography>
            <IconButton aria-label="Close business details" onClick={() => setDetails(false)}>
              <X />
            </IconButton>
          </Stack>
          {business && (
            <>
              <Typography variant="h4">{business.fields.name}</Typography>
              {Object.entries(business.fields)
                .filter(([key]) => key !== 'name')
                .map(([key, value]) => (
                  <Box key={key} sx={{ my: 2 }}>
                    <Typography variant="overline">{key}</Typography>
                    <Typography>{value || '—'}</Typography>
                  </Box>
                ))}
              <Chip label={business.registration} />
              <Button
                sx={{ mt: 2 }}
                onClick={() => {
                  setFields(business.fields)
                  setDetails(false)
                  setForm('business')
                }}
              >
                {hi ? 'विवरण बदलें' : 'Edit business'}
              </Button>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6">{hi ? 'उत्पाद' : 'Inventory'}</Typography>
              {products.map((product) => (
                <Box key={product.id} sx={{ py: 2 }}>
                  <Typography>
                    {product.name} · ₹{(product.price / 100).toFixed(2)} / {product.unit}
                  </Typography>
                  <Typography variant="body2">Stock: {product.stock ?? 'not provided'}</Typography>
                  <Button
                    onClick={() => {
                      setItem({
                        name: product.name,
                        price: String(product.price / 100),
                        unit: product.unit,
                        stock: product.stock === null ? '' : String(product.stock),
                      })
                      setDetails(false)
                      setForm('inventory')
                    }}
                  >
                    Edit product
                  </Button>
                </Box>
              ))}
              <Button
                color="error"
                onClick={() => {
                  void api('/face/template', { method: 'DELETE' })
                    .then(() => reload())
                    .catch((cause: unknown) =>
                      setError(cause instanceof Error ? cause.message : 'Deletion unavailable'),
                    )
                }}
              >
                Delete my face template
              </Button>
            </>
          )}
        </Box>
      </Drawer>
      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="edit-v1-title"
      >
        <DialogTitle id="edit-v1-title">
          {form === 'business'
            ? hi
              ? 'व्यवसाय विवरण'
              : 'Business details'
            : hi
              ? 'उत्पाद विवरण'
              : 'Product details'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            {form === 'business' ? (
              Object.entries(fields).map(([key, value]) => (
                <TextField
                  key={key}
                  label={
                    {
                      name: hi ? 'नाम' : 'Business name',
                      category: hi ? 'श्रेणी' : 'Category',
                      location: hi ? 'स्थान' : 'Location',
                      hours: hi ? 'समय' : 'Hours',
                      phone: hi ? 'फोन' : 'Phone',
                    }[key]
                  }
                  value={value}
                  onChange={(event) => setFields((old) => ({ ...old, [key]: event.target.value }))}
                  required={key === 'name'}
                />
              ))
            ) : (
              <>
                <TextField
                  label={hi ? 'उत्पाद का नाम' : 'Product name'}
                  value={item.name}
                  onChange={(event) => setItem({ ...item, name: event.target.value })}
                />
                <TextField
                  label={hi ? 'कीमत (₹)' : 'Price (₹)'}
                  type="number"
                  value={item.price}
                  onChange={(event) => setItem({ ...item, price: event.target.value })}
                />
                <TextField
                  label={hi ? 'इकाई' : 'Unit'}
                  value={item.unit}
                  onChange={(event) => setItem({ ...item, unit: event.target.value })}
                />
                <TextField
                  label={hi ? 'मात्रा (वैकल्पिक)' : 'Stock (optional)'}
                  type="number"
                  value={item.stock}
                  onChange={(event) => setItem({ ...item, stock: event.target.value })}
                />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)}>{hi ? 'रद्द करें' : 'Cancel'}</Button>
          <Button
            variant="contained"
            onClick={() => {
              void prepare()
            }}
          >
            {hi ? 'पहले जाँचें' : 'Review first'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={proposal !== null}
        onClose={() => {
          if (!busy) setProposal(null)
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="proposal-title"
      >
        <DialogTitle id="proposal-title">
          {hi ? 'सहेजने से पहले जाँचें' : 'Review before saving'}
        </DialogTitle>
        <DialogContent>
          {proposal && (
            <Stack spacing={2}>
              <Alert severity="info">
                {hi
                  ? 'केवल आपके निजी रिकॉर्ड बदलेंगे। Google पर कुछ प्रकाशित नहीं होगा।'
                  : 'This changes your private records. Nothing is published to Google.'}
              </Alert>
              {proposal.snapshot.kind === 'business'
                ? Object.entries(proposal.snapshot.business ?? {})
                    .filter(([, value]) => value)
                    .map(([key, value]) => (
                      <Box key={key}>
                        <Typography variant="overline">{key}</Typography>
                        <Typography>{String(value)}</Typography>
                      </Box>
                    ))
                : proposal.snapshot.products.map((product) => (
                    <Typography key={product.name}>
                      {product.name} · ₹{(product.price / 100).toFixed(2)} / {product.unit} · Stock:{' '}
                      {product.stock ?? 'not provided'}
                    </Typography>
                  ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setProposal(null)}>
            {hi ? 'रद्द करें' : 'Cancel'}
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => {
              void approve()
            }}
          >
            {hi ? 'जाँच लिया — सहेजें' : 'Confirm and save'}
          </Button>
        </DialogActions>
      </Dialog>
      {active && (
        <FaceDialog
          key={face ? 'open-' + active : 'closed-' + active}
          open={face}
          businessId={active}
          api={api}
          language={language}
          onClose={() => setFace(false)}
          onResult={() => {
            void reload()
          }}
        />
      )}
    </Box>
  )
}
