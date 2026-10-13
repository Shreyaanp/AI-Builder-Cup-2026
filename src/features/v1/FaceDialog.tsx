import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import type { Api } from './api'

interface Challenge {
  id: string
  prompts: string[]
  expires: number
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
const PROMPT_LABELS: Record<'turn_left' | 'turn_right' | 'look_up', { en: string; hi: string }> = {
  turn_left: { en: 'Slowly turn your head left', hi: 'धीरे बाईं ओर देखें' },
  turn_right: { en: 'Slowly turn your head right', hi: 'धीरे दाईं ओर देखें' },
  look_up: { en: 'Slowly look up', hi: 'धीरे ऊपर देखें' },
}
export function FaceDialog({
  open,
  businessId,
  api,
  language,
  onClose,
  onResult,
}: {
  open: boolean
  businessId: string
  api: Api
  language: 'en' | 'hi'
  onClose: () => void
  onResult: () => void
}) {
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<'consent' | 'capturing' | 'processing' | 'result'>('consent')
  const [notice, setNotice] = useState('')
  const [guidance, setGuidance] = useState('')
  const [progress, setProgress] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const live = useRef<Capture | null>(null)
  const hi = language === 'hi'
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
  async function begin() {
    if (live.current) return
    const capture: Capture = { abort: new AbortController(), chunks: [] }
    live.current = capture
    setNotice('')
    setState('capturing')
    setProgress(0)
    try {
      const challenge = await api<Challenge>('/face/challenges', {
        method: 'POST',
        signal: capture.abort.signal,
        body: JSON.stringify({ business_id: businessId, consent }),
      })
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      if (live.current !== capture) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      capture.stream = stream
      if (!video.current) throw new Error('Camera view unavailable')
      video.current.srcObject = stream
      await video.current.play()
      const worker = new Worker(new URL('./face.worker.ts', import.meta.url), { type: 'module' })
      capture.worker = worker
      let detecting = false
      let ready = false
      worker.onmessage = (event: MessageEvent<{ kind: string; faces?: number }>) => {
        if (event.data.kind === 'ready') ready = true
        detecting = false
        if (event.data.kind === 'guidance')
          setGuidance(
            event.data.faces === 1
              ? hi
                ? 'एक चेहरा दिख रहा है'
                : 'One face visible'
              : hi
                ? 'केवल अपना चेहरा दिखाएँ'
                : 'Keep exactly one face visible',
          )
        if (event.data.kind === 'unavailable')
          setGuidance(
            hi
              ? 'कैमरा मार्गदर्शन उपलब्ध नहीं; सर्वर जाँच करेगा'
              : 'Camera guidance unavailable; server evaluation still applies',
          )
      }
      worker.postMessage({ kind: 'init' })
      const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )
      if (!mime) throw new Error('Video capture unsupported')
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 500000 })
      capture.recorder = recorder
      recorder.ondataavailable = (event) => {
        if (live.current === capture && event.data.size) capture.chunks.push(event.data)
      }
      recorder.onstop = () => {
        void submit(challenge, capture, mime)
      }
      recorder.start(250)
      let elapsed = 0
      capture.interval = setInterval(() => {
        elapsed += 500
        setProgress(Math.min(100, elapsed / 80))
        const prompt = challenge.prompts[Math.min(1, Math.floor(elapsed / 4000))] ?? 'turn_left'
        const label = PROMPT_LABELS[prompt as keyof typeof PROMPT_LABELS] ?? PROMPT_LABELS.turn_left
        setNotice(hi ? label.hi : label.en)
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
      }, 500)
      capture.timeout = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 8000)
    } catch {
      if (live.current === capture) {
        release()
        setState('result')
        setNotice(
          hi
            ? 'कैमरा उपलब्ध नहीं। आपका ड्राफ्ट सुरक्षित है; बाद में फिर जाँचें।'
            : 'Camera unavailable. Your draft is safe; you can retry later.',
        )
      }
    }
  }
  async function submit(challenge: Challenge, capture: Capture, mime: string) {
    if (live.current !== capture) return
    clearInterval(capture.interval)
    clearTimeout(capture.timeout)
    capture.stream?.getTracks().forEach((track) => track.stop())
    capture.worker?.terminate()
    setState('processing')
    const blob = new Blob(capture.chunks, { type: mime })
    capture.chunks.length = 0
    try {
      if (blob.size > 8 * 1024 * 1024) throw new Error('Capture too large')
      const result = await api<{
        status: string
        reason: string
        liveness: string
        one_to_one: string
        one_to_many: string
      }>(`/face/challenges/${challenge.id}/capture`, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': mime },
        signal: capture.abort.signal,
      })
      if (live.current === capture) {
        setNotice(
          (hi
            ? 'जाँच लंबित है। ड्राफ्ट और उत्पाद जोड़ना जारी रख सकते हैं। '
            : 'Verification pending. You can continue your draft and inventory. ') +
            `${result.reason} · Liveness: ${result.liveness} · 1:1: ${result.one_to_one} · 1:N: ${result.one_to_many}`,
        )
        setState('result')
        onResult()
      }
    } catch {
      if (live.current === capture) {
        setNotice(
          hi
            ? 'जाँच पूरी नहीं हुई। ड्राफ्ट सुरक्षित है।'
            : 'Evaluation did not finish. Your draft is preserved.',
        )
        setState('result')
      }
    } finally {
      if (live.current === capture) release()
    }
  }
  function close() {
    release()
    onClose()
  }
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="face-title">
      <DialogTitle id="face-title">{hi ? 'चेहरा पंजीकरण' : 'Face registration'}</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          {state === 'consent' && (
            <>
              <Typography>
                {hi
                  ? 'हम पहचान मिलान के लिए चेहरे का वेक्टर रखते हैं। फोटो/वीडियो प्रक्रिया के बाद हटा दिए जाते हैं। यह व्यवसाय के मालिक होने का प्रमाण नहीं है।'
                  : 'We retain a face template for matching, not your capture photos or video. Media is discarded after processing. A face match does not establish business ownership.'}
              </Typography>
              <Alert severity="info">
                {hi
                  ? 'जाँच अभी मूल्यांकन चरण में है। स्वतः पहचान प्रमाणित नहीं होती।'
                  : 'Verification is under evaluation. Automatic identity approval is disabled.'}
              </Alert>
              <FormControlLabel
                control={
                  <Checkbox checked={consent} onChange={(_, checked) => setConsent(checked)} />
                }
                label={
                  hi
                    ? 'मैं चेहरे का वेक्टर बनाने और दोहराए पंजीकरण की जाँच के लिए सहमत हूँ'
                    : 'I consent to a face template and repeat-enrollment matching'
                }
              />
            </>
          )}
          {(state === 'capturing' || state === 'processing') && (
            <>
              <Box
                component="video"
                ref={video}
                muted
                playsInline
                sx={{
                  width: '100%',
                  borderRadius: 3,
                  transform: 'scaleX(-1)',
                  bgcolor: 'surfaceContainerLow',
                  maxHeight: 340,
                }}
              />
              <LinearProgress
                variant={state === 'processing' ? 'indeterminate' : 'determinate'}
                value={progress}
              />
              <Typography role="status">
                {state === 'processing'
                  ? hi
                    ? 'निजी जाँच चल रही है…'
                    : 'Evaluating privately…'
                  : notice}
              </Typography>
              <Typography variant="body2">{guidance}</Typography>
            </>
          )}
          {state === 'result' && <Alert severity="info">{notice}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{hi ? 'ड्राफ्ट पर लौटें' : 'Return to draft'}</Button>
        {state === 'consent' && (
          <Button
            variant="contained"
            disabled={!consent}
            onClick={() => {
              void begin()
            }}
          >
            {hi ? 'कैमरा खोलें' : 'Open camera'}
          </Button>
        )}
        {state === 'result' && (
          <Button
            onClick={() => {
              setState('consent')
              setNotice('')
            }}
          >
            {hi ? 'फिर जाँचें' : 'Try again'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
