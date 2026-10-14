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
import { useCopy } from './strings'
import { useLocale } from '../../state/hooks'
import { LEGAL } from './legal'

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
export function FaceDialog({
  open,
  businessId,
  api,
  onClose,
  onResult,
}: {
  open: boolean
  businessId: string
  api: Api
  onClose: () => void
  onResult: () => void
}) {
  const t = useCopy()
  const locale = useLocale()
  const legal = LEGAL[locale] ?? LEGAL.en!
  const promptLabels: Record<string, string> = {
    turn_left: t.faceLeft,
    turn_right: t.faceRight,
    look_up: t.faceUp,
  }
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<'consent' | 'capturing' | 'processing' | 'result'>('consent')
  const [notice, setNotice] = useState('')
  const [guidance, setGuidance] = useState('')
  const [progress, setProgress] = useState(0)
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
          setGuidance(event.data.faces === 1 ? t.faceOneVisible : t.faceOnlyOne)
        if (event.data.kind === 'unavailable') setGuidance(t.faceGuidanceUnavailable)
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
        setNotice(promptLabels[prompt] ?? t.faceLeft)
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
        setNotice(t.faceCameraUnavailable)
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
          `${t.facePending} ${t.faceResult(result.reason, result.liveness, result.one_to_one, result.one_to_many)}`,
        )
        setState('result')
        onResult()
      }
    } catch {
      if (live.current === capture) {
        setNotice(t.faceFailed)
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
      <DialogTitle id="face-title">{t.faceTitle}</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          {state === 'consent' && (
            <>
              {legal.BIOMETRIC_NOTICE.map((paragraph) => (
                <Typography key={paragraph}>{paragraph}</Typography>
              ))}
              <Alert severity="info">{t.faceEvaluation}</Alert>
              <FormControlLabel
                control={
                  <Checkbox checked={consent} onChange={(_, checked) => setConsent(checked)} />
                }
                label={t.faceConsent}
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
                {state === 'processing' ? t.faceProcessing : notice}
              </Typography>
              <Typography variant="bodyMedium">{guidance}</Typography>
            </>
          )}
          {state === 'result' && <Alert severity="info">{notice}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t.faceReturn}</Button>
        {state === 'consent' && (
          <Button
            variant="contained"
            disabled={!consent}
            onClick={() => {
              void begin()
            }}
          >
            {t.faceCamera}
          </Button>
        )}
        {state === 'result' && (
          <Button
            onClick={() => {
              setState('consent')
              setNotice('')
            }}
          >
            {t.retry}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
