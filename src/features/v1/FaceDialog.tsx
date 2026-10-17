import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  CameraOff,
  CloudOff,
  RotateCcw,
  ScanFace,
  UserSearch,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useConversationCopy } from '../discover/conversationCopy'
import type { Api } from './api'
import { useBackClose } from './backStack'
import { motion, shape } from '../../design/theme'
import { announceTrustChange } from '../trust/useTrust'
import { useTrustCopy } from '../trust/copy'

interface Challenge {
  id: string
  prompts: string[]
}
interface Capture {
  stream?: MediaStream
  recorder?: MediaRecorder
  worker?: Worker
  interval?: ReturnType<typeof setInterval>
  timeout?: ReturnType<typeof setTimeout>
  abort: AbortController
  chunks: Blob[]
}
type Phase = 'intro' | 'camera' | 'processing' | 'result'
interface Outcome {
  result: 'verified' | 'in_review' | 'retry' | 'unavailable'
  reason?: string
}
type Guide = 'ok' | 'none' | 'many' | 'closer' | null

const CAPTURE_MS = 8000
// Look straight first, then each prompt for half of what remains.
const READY_MS = 1000
const ARROWS: Record<string, ReactNode> = {
  turn_left: <ArrowLeft size={22} />,
  turn_right: <ArrowRight size={22} />,
  look_up: <ArrowUp size={22} />,
}
const EASE = motion.easing.emphasizedDecelerate

function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'camera_blocked'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'camera_missing'
  return 'unsupported'
}

/** The optional "Verify it's you" check: consent → 8-second guided capture → result. */
export function FaceDialog({
  open,
  businessId,
  api,
  onClose,
}: {
  open: boolean
  businessId: string
  api: Api
  onClose: () => void
}) {
  const c = useTrustCopy()
  const theme = useTheme()
  const roles = theme.material
  const phone = useMediaQuery(theme.breakpoints.down('sm'))
  const [consent, setConsent] = useState(false)
  const [showHow, setShowHow] = useState(false)
  const more = useConversationCopy()
  const [phase, setPhase] = useState<Phase>('intro')
  const [prompt, setPrompt] = useState<string | null>(null)
  const [guide, setGuide] = useState<Guide>(null)
  const [progress, setProgress] = useState(0)
  const [slow, setSlow] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const live = useRef<Capture | null>(null)

  function release() {
    const capture = live.current
    live.current = null
    if (!capture) return
    capture.abort.abort()
    clearInterval(capture.interval)
    clearTimeout(capture.timeout)
    capture.worker?.terminate()
    if (capture.recorder?.state === 'recording') capture.recorder.stop()
    capture.stream?.getTracks().forEach((track) => track.stop())
    capture.chunks.length = 0
    if (video.current) video.current.srcObject = null
  }
  useEffect(() => () => release(), [])

  function finish(next: Outcome) {
    setOutcome(next)
    setPhase('result')
  }

  async function begin() {
    if (live.current) return
    const capture: Capture = { abort: new AbortController(), chunks: [] }
    live.current = capture
    setPhase('camera')
    setProgress(0)
    setPrompt(null)
    setGuide(null)
    setSlow(false)
    const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(
      (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
    )
    if (!mime) {
      release()
      finish({ result: 'unavailable', reason: 'unsupported' })
      return
    }
    let stream: MediaStream
    try {
      // Camera first: a refused permission never starts a server challenge.
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
    } catch (error) {
      if (live.current === capture) {
        release()
        finish({ result: 'unavailable', reason: cameraProblem(error) })
      }
      return
    }
    if (live.current !== capture) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    capture.stream = stream
    try {
      const challenge = await api<Challenge>('/face/challenges', {
        method: 'POST',
        signal: capture.abort.signal,
        body: JSON.stringify({ business_id: businessId, consent }),
      })
      if (!video.current) throw new Error('Camera view unavailable')
      video.current.srcObject = stream
      await video.current.play()
      // On-device guidance only (face in the oval, one face); the server decides.
      const worker = new Worker(new URL('./face.worker.ts', import.meta.url), { type: 'module' })
      capture.worker = worker
      let detecting = false
      let ready = false
      worker.onmessage = (
        event: MessageEvent<{ kind: string; faces?: number; width?: number }>,
      ) => {
        detecting = false
        if (event.data.kind === 'ready') ready = true
        if (event.data.kind === 'unavailable') setGuide(null)
        if (event.data.kind === 'guidance') {
          const faces = event.data.faces ?? 0
          setGuide(
            faces === 0
              ? 'none'
              : faces > 1
                ? 'many'
                : (event.data.width ?? 1) < 0.22
                  ? 'closer'
                  : 'ok',
          )
        }
      }
      worker.postMessage({ kind: 'init' })
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 500000 })
      capture.recorder = recorder
      recorder.ondataavailable = (event) => {
        if (live.current === capture && event.data.size) capture.chunks.push(event.data)
      }
      recorder.onstop = () => {
        void submit(challenge, capture, mime)
      }
      // Real time, not ticks: a busy phone delays timers, and the prompts must match the recording.
      let started = Infinity
      recorder.onstart = (event) => {
        started = event.timeStamp
      }
      recorder.start(250)
      const span = (CAPTURE_MS - READY_MS) / challenge.prompts.length
      capture.interval = setInterval(() => {
        const elapsed = Math.max(0, performance.now() - started)
        setProgress(Math.min(100, (elapsed / CAPTURE_MS) * 100))
        setPrompt(
          elapsed < READY_MS
            ? null
            : (challenge.prompts[
                Math.min(challenge.prompts.length - 1, Math.floor((elapsed - READY_MS) / span))
              ] ?? null),
        )
        if (ready && !detecting && video.current?.readyState === 4) {
          detecting = true
          void createImageBitmap(video.current)
            .then((bitmap) => {
              if (live.current === capture) worker.postMessage({ kind: 'frame', bitmap }, [bitmap])
              else bitmap.close()
            })
            .catch(() => {
              detecting = false
            })
        }
      }, 250)
      capture.timeout = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, CAPTURE_MS)
    } catch {
      if (live.current === capture) {
        release()
        finish({ result: 'unavailable', reason: 'worker_unavailable' })
      }
    }
  }

  async function submit(challenge: Challenge, capture: Capture, mime: string) {
    if (live.current !== capture) return
    clearInterval(capture.interval)
    clearTimeout(capture.timeout)
    capture.stream?.getTracks().forEach((track) => track.stop())
    capture.worker?.terminate()
    setProgress(100)
    setPhase('processing')
    const slowTimer = setTimeout(() => setSlow(true), 6000)
    const blob = new Blob(capture.chunks, { type: mime })
    capture.chunks.length = 0
    try {
      if (blob.size > 8 * 1024 * 1024) throw new Error('Capture too large')
      const answer = await api<Outcome>(`/face/challenges/${challenge.id}/capture`, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': mime },
        signal: capture.abort.signal,
      })
      if (live.current === capture) {
        finish(answer)
        if (answer.result === 'verified' || answer.result === 'in_review') announceTrustChange()
      }
    } catch {
      if (live.current === capture) finish({ result: 'unavailable', reason: 'worker_unavailable' })
    } finally {
      clearTimeout(slowTimer)
      if (live.current === capture) release()
    }
  }

  function close() {
    release()
    onClose()
  }
  function retry() {
    setOutcome(null)
    void begin()
  }
  useBackClose(open, close)

  const result = outcome && resultView(outcome)
  function resultView(answer: Outcome) {
    const reason = c.reasons[answer.reason ?? ''] ?? c.reasons.capture_not_usable
    if (answer.result === 'verified')
      return { icon: <BadgeCheck size={40} />, title: c.verifiedTitle, body: c.verifiedBody }
    if (answer.result === 'in_review')
      return { icon: <UserSearch size={40} />, title: c.reviewTitle, body: c.inReview }
    if (answer.reason === 'camera_blocked' || answer.reason === 'camera_missing')
      return { icon: <CameraOff size={40} />, title: c.retryTitle, body: reason }
    if (answer.result === 'unavailable')
      return { icon: <CloudOff size={40} />, title: c.unavailableTitle, body: reason }
    return { icon: <RotateCcw size={40} />, title: c.retryTitle, body: reason }
  }
  const success = outcome?.result === 'verified' || outcome?.result === 'in_review'
  const ringSize = phone ? 260 : 300

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      fullScreen={phone}
      maxWidth="sm"
      aria-labelledby="face-title"
      sx={{ '& .MuiDialog-paper': { overscrollBehavior: 'contain' } }}
    >
      <DialogTitle id="face-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
          <ScanFace size={24} />
        </Box>
        {c.title}
      </DialogTitle>
      <DialogContent>
        {phase === 'intro' && (
          <Stack spacing={2.5}>
            <Typography variant="bodyLarge">{c.pitch}</Typography>
            <Button
              onClick={() => setShowHow((value) => !value)}
              aria-expanded={showHow}
              aria-controls="face-how"
              sx={{ alignSelf: 'flex-start', minHeight: 48 }}
            >
              {showHow ? more.less : more.more}
            </Button>
            {showHow && (
              <Box
                id="face-how"
                component="ol"
                sx={{
                  m: 0,
                  p: 2,
                  pl: 5,
                  borderRadius: `${shape.lg}px`,
                  bgcolor: roles.surfaceContainerLow,
                  display: 'grid',
                  gap: 1,
                }}
              >
                {c.how.map((line) => (
                  <Typography component="li" variant="bodyMedium" key={line}>
                    {line}
                  </Typography>
                ))}
              </Box>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={consent}
                  onChange={(_, checked) => setConsent(checked)}
                  sx={{ p: 1.5 }}
                />
              }
              label={c.consent}
              sx={{ alignItems: 'center', minHeight: 48 }}
            />
          </Stack>
        )}

        {(phase === 'camera' || phase === 'processing') && (
          <Stack spacing={2.5} sx={{ alignItems: 'center', pt: 1 }}>
            <Box
              sx={{
                position: 'relative',
                width: ringSize,
                height: ringSize * 1.2,
                borderRadius: `${shape.xl}px`,
                overflow: 'hidden',
                bgcolor: roles.surfaceContainerHighest,
              }}
            >
              <Box
                component="video"
                ref={video}
                muted
                playsInline
                aria-hidden="true"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  // A mirror, as owners expect from a front camera; the recording is not.
                  transform: 'scaleX(-1)',
                  opacity: phase === 'processing' ? 0.25 : 1,
                  transition: `opacity ${motion.duration.medium}ms ${EASE}`,
                }}
              />
              <Box
                component="svg"
                viewBox="0 0 100 120"
                aria-hidden="true"
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              >
                <defs>
                  <mask id="face-oval">
                    <rect width="100" height="120" fill="white" />
                    <ellipse cx="50" cy="58" rx="33" ry="43" fill="black" />
                  </mask>
                </defs>
                <rect
                  width="100"
                  height="120"
                  fill={roles.scrim}
                  fillOpacity={0.45}
                  mask="url(#face-oval)"
                />
                <ellipse
                  cx="50"
                  cy="58"
                  rx="33"
                  ry="43"
                  fill="none"
                  stroke={roles.outlineVariant}
                  strokeWidth="2"
                />
                {/* The progress ring follows the oval clockwise from the top. */}
                <path
                  d="M50 15 a33 43 0 1 1 0 86 a33 43 0 1 1 0 -86"
                  fill="none"
                  stroke={guide === 'ok' || phase === 'processing' ? roles.primary : roles.outline}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray="100"
                  strokeDashoffset={100 - progress}
                  style={{ transition: 'stroke-dashoffset 250ms linear, stroke 200ms linear' }}
                />
              </Box>
              {phase === 'processing' && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <CircularProgress aria-label={c.checking} />
                </Box>
              )}
            </Box>
            <Box
              role="progressbar"
              aria-label={c.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}
            />
            <Box role="status" aria-live="polite" sx={{ textAlign: 'center', minHeight: 64 }}>
              {phase === 'processing' ? (
                <>
                  <Typography variant="titleMedium">{c.checking}</Typography>
                  {slow && (
                    <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 0.5 }}>
                      {c.checkingSlow}
                    </Typography>
                  )}
                </>
              ) : (
                <Stack
                  key={prompt ?? 'ready'}
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    '@keyframes facePrompt': {
                      from: { opacity: 0, transform: 'translateY(6px)' },
                      to: { opacity: 1, transform: 'none' },
                    },
                    animation: `facePrompt ${motion.duration.medium}ms ${EASE} both`,
                  }}
                >
                  {prompt && (
                    <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
                      {ARROWS[prompt]}
                    </Box>
                  )}
                  <Typography variant="titleMedium">
                    {prompt ? (c.prompts[prompt] ?? c.getReady) : c.getReady}
                  </Typography>
                </Stack>
              )}
            </Box>
            {phase === 'camera' && (
              // Live hints change several times a second: visible, not announced.
              <Typography variant="bodyMedium" color="text.secondary" sx={{ minHeight: 24 }}>
                {guide ? c.guide[guide] : ''}
              </Typography>
            )}
          </Stack>
        )}

        {phase === 'result' && result && (
          <Stack
            role="status"
            spacing={2}
            sx={{
              alignItems: 'center',
              textAlign: 'center',
              py: 3,
              '@keyframes faceResult': {
                from: { opacity: 0, transform: 'scale(0.92)' },
                to: { opacity: 1, transform: 'none' },
              },
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: success ? roles.primaryContainer : roles.secondaryContainer,
                color: success ? roles.onPrimaryContainer : roles.onSecondaryContainer,
                animation: `faceResult ${motion.duration.enter}ms ${EASE} both`,
              }}
            >
              {result.icon}
            </Box>
            <Typography component="h3" variant="titleLarge">
              {result.title}
            </Typography>
            <Typography variant="bodyMedium" color="text.secondary" sx={{ maxWidth: 420 }}>
              {result.body}
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap' }}>
        {phase === 'intro' && (
          <>
            <Button onClick={close}>{c.notNow}</Button>
            <Button variant="contained" disabled={!consent} onClick={() => void begin()}>
              {c.openCamera}
            </Button>
          </>
        )}
        {phase === 'camera' && (
          <Button
            onClick={() => {
              release()
              setPhase('intro')
            }}
          >
            {c.cancel}
          </Button>
        )}
        {phase === 'result' && (
          <>
            {!success && <Button onClick={close}>{c.notNow}</Button>}
            {success ? (
              <Button variant="contained" onClick={close}>
                {c.done}
              </Button>
            ) : (
              <Button variant="contained" startIcon={<RotateCcw size={18} />} onClick={retry}>
                {c.tryAgain}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
