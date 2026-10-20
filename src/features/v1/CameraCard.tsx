import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { Camera, Check, RotateCcw, SkipForward, Upload, X } from 'lucide-react'
import { enterRise, motion, shape } from '../../design/theme'
import { useBackClose } from './backStack'
import { useInChatCopy } from './inChatCopy'
import { useOnboardingCopy } from './onboardingCopy'
import { useVoiceModeCopy } from './voiceModeCopy'

export type Shot = 'board' | 'front'
type Problem = 'blocked' | 'no-camera' | 'failed'
type Phase = 'ask' | 'starting' | 'live' | 'preview' | 'sending' | 'problem'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * The camera's entry point in the conversation: a card with the reason, "Open camera", upload and
 * a big Skip. Opening the camera takes the whole screen (dark backdrop, a highlighted frame guide,
 * a big shutter, retake and "Use photo", upload as the fallback) and returns to the chat with the
 * photo. Only video is requested, so the voice mic carries on.
 */
export function CameraCard({
  shots,
  onPhoto,
  onClose,
  onActive,
}: {
  shots: Shot[]
  /** Returns a localised recovery message when the photo could not be read. */
  onPhoto: (file: File) => Promise<string | null>
  /** `quiet`: the X or a finished photo, nothing is said; otherwise the owner chose Skip. */
  onClose: (quiet: boolean) => void
  /** The owner is using the camera (the coach waits instead of nudging). */
  onActive?: () => void
}) {
  const c = useInChatCopy()
  const v = useVoiceModeCopy()
  const o = useOnboardingCopy()
  const roles = useTheme().material
  const [phase, setPhase] = useState<Phase>('ask')
  const [problem, setProblem] = useState<Problem>('failed')
  const [index, setIndex] = useState(0)
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null)
  const [flash, setFlash] = useState(0)
  const [readError, setReadError] = useState<string | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const shutter = useRef<HTMLButtonElement>(null)
  const shot = shots[index] ?? 'board'

  function stop() {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }
  async function start() {
    onActive?.()
    setPhase('starting')
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem('no-camera')
      setPhase('problem')
      return
    }
    try {
      stop()
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      })
      setPhase('live')
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : ''
      setProblem(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'blocked'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'no-camera'
            : 'failed',
      )
      setPhase('problem')
    }
  }
  useEffect(() => stop, [])
  // The stream goes into the viewfinder whenever it is on screen.
  useEffect(() => {
    if (phase !== 'live' || !video.current || !stream.current) return
    video.current.srcObject = stream.current
    void video.current.play().catch(() => undefined)
    shutter.current?.focus({ preventScroll: true })
  }, [phase, index])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url)
    },
    [preview],
  )

  function capture() {
    const node = video.current
    if (!node || !node.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = node.videoWidth
    canvas.height = node.videoHeight
    canvas.getContext('2d')?.drawImage(node, 0, 0)
    setFlash((n) => n + 1)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `${shot}.jpg`, { type: 'image/jpeg' })
        setPreview({ url: URL.createObjectURL(blob), file })
        setPhase('preview')
      },
      'image/jpeg',
      0.9,
    )
  }
  function advance() {
    setPreview(null)
    if (index + 1 < shots.length) {
      setIndex(index + 1)
      setPhase(stream.current ? 'live' : 'ask')
    } else {
      stop()
      onClose(true)
    }
  }
  async function send(file: File) {
    setReadError(null)
    setPhase('sending')
    const error = await onPhoto(file)
    if (error) {
      stop()
      setPreview(null)
      setReadError(error)
      setPhase('ask')
      return
    }
    advance()
  }
  function close(quiet: boolean) {
    stop()
    onClose(quiet)
  }
  /** The full-screen camera closes; the owner is back at the card in the chat. */
  function leave() {
    stop()
    setPreview(null)
    setPhase('ask')
  }
  const fullScreen =
    phase === 'starting' || phase === 'live' || phase === 'preview' || phase === 'sending'

  const guide = shot === 'board' ? c.guideBoard : c.guideFront
  const title = shot === 'board' ? c.cameraBoard : c.cameraFront
  const [problemTitle, problemBody] =
    problem === 'blocked'
      ? [c.cameraBlockedTitle, c.cameraBlockedBody]
      : problem === 'no-camera'
        ? [c.noCameraTitle, c.noCameraBody]
        : [c.cameraFailedTitle, c.cameraFailedBody]
  const uploadButton = (
    <Button
      variant="outlined"
      startIcon={<Upload size={18} />}
      onClick={() => upload.current?.click()}
      disabled={phase === 'sending'}
      sx={{ minHeight: 48 }}
    >
      {c.uploadInstead}
    </Button>
  )

  return (
    <Box
      data-testid="camera-card"
      data-phase={phase}
      data-shot={shot}
      sx={{
        p: 2,
        borderRadius: `${shape.lg}px`,
        bgcolor: roles.surfaceContainerLow,
        border: `1px solid ${roles.outlineVariant}`,
        ...enterRise,
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Camera size={20} aria-hidden="true" color={roles.primary} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h3" variant="titleSmall">
            {title}
          </Typography>
          {shots.length > 1 && (
            <Typography variant="bodySmall" color="text.secondary">
              {c.shotOf(index + 1, shots.length)}
            </Typography>
          )}
        </Box>
        <Tooltip title={c.closeCamera}>
          <IconButton aria-label={c.closeCamera} onClick={() => close(true)} sx={{ mr: -1 }}>
            <X size={20} />
          </IconButton>
        </Tooltip>
      </Stack>

      {(phase === 'ask' || fullScreen) && (
        <Stack spacing={2}>
          {readError && (
            <Alert severity="warning" data-testid="photo-read-error">
              {readError}
            </Alert>
          )}
          <Typography variant="bodyMedium" color="text.secondary">
            {readError ? guide : c.cameraWhy}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<Camera size={18} />}
              onClick={() => void start()}
              disabled={fullScreen}
              sx={{ minHeight: 48 }}
            >
              {c.openCamera}
            </Button>
            {uploadButton}
          </Stack>
          {/* The photo is optional: a big Skip ("baad mein"); Today reminds the owner later. */}
          <Button
            fullWidth
            variant="text"
            size="large"
            startIcon={<SkipForward size={18} />}
            onClick={() => close(false)}
            sx={{ minHeight: 52 }}
          >
            {o.skipForNow}
          </Button>
        </Stack>
      )}

      {phase === 'problem' && (
        <Alert
          data-testid="camera-alert"
          data-problem={problem}
          severity="warning"
          onClose={() => close(true)}
          closeText={v.close}
          sx={{
            borderRadius: `${shape.lg}px`,
            '& .MuiAlert-icon': { display: { xs: 'none', sm: 'flex' } },
          }}
        >
          <AlertTitle>{problemTitle}</AlertTitle>
          <Typography variant="bodyMedium">{problemBody}</Typography>
          <Stack direction="row" sx={{ gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {problem !== 'no-camera' && (
              <Button variant="contained" size="small" onClick={() => void start()}>
                {v.tryAgain}
              </Button>
            )}
            <Button
              variant="outlined"
              size="small"
              startIcon={<Upload size={16} />}
              onClick={() => upload.current?.click()}
            >
              {c.uploadInstead}
            </Button>
          </Stack>
        </Alert>
      )}

      {fullScreen && (
        <FullScreenCamera
          title={title}
          guide={guide}
          shot={shot}
          phase={phase}
          preview={preview}
          flash={flash}
          shotLabel={shots.length > 1 ? c.shotOf(index + 1, shots.length) : null}
          video={video}
          shutter={shutter}
          onCapture={capture}
          onLeave={leave}
          onSkipShot={shots.length > 1 ? advance : null}
          onUpload={() => upload.current?.click()}
          onRetake={() => {
            setPreview(null)
            setPhase('live')
          }}
          onUse={() => preview && void send(preview.file)}
        />
      )}

      <input
        ref={upload}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void send(file)
        }}
      />
    </Box>
  )
}

/** The camera in a full-screen dialog, in the style of the big map: dark, one job per button. */
function FullScreenCamera({
  title,
  guide,
  shot,
  phase,
  preview,
  flash,
  shotLabel,
  video,
  shutter,
  onCapture,
  onLeave,
  onSkipShot,
  onUpload,
  onRetake,
  onUse,
}: {
  title: string
  guide: string
  shot: Shot
  phase: Phase
  preview: { url: string; file: File } | null
  flash: number
  shotLabel: string | null
  video: RefObject<HTMLVideoElement | null>
  shutter: RefObject<HTMLButtonElement | null>
  onCapture: () => void
  onLeave: () => void
  onSkipShot: (() => void) | null
  onUpload: () => void
  onRetake: () => void
  onUse: () => void
}) {
  const c = useInChatCopy()
  const chalk = useTheme().chalk
  const ink = '#fff'
  useBackClose(true, onLeave)
  return (
    <Dialog
      open
      fullScreen
      onClose={onLeave}
      aria-labelledby="camera-modal-title"
      slotProps={{ paper: { sx: { bgcolor: '#000', color: ink, backgroundImage: 'none' } } }}
    >
      <Box
        data-testid="camera-modal"
        data-phase={phase}
        data-shot={shot}
        sx={{
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          pt: 'env(safe-area-inset-top)',
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 2, minHeight: 56 }}>
          <Tooltip title={c.closeCamera}>
            <IconButton
              aria-label={c.closeCamera}
              onClick={onLeave}
              sx={{ minWidth: 48, minHeight: 48, color: ink }}
            >
              <X size={22} />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id="camera-modal-title" component="h2" variant="titleMedium">
              {title}
            </Typography>
            {shotLabel && (
              <Typography variant="bodySmall" sx={{ opacity: 0.8 }}>
                {shotLabel}
              </Typography>
            )}
          </Box>
        </Stack>

        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {phase === 'starting' && (
            <Stack
              sx={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={28} color="inherit" />
              <Typography variant="bodyMedium">{c.startingCamera}</Typography>
            </Stack>
          )}
          {(phase === 'live' || phase === 'starting') && (
            <Box
              component="video"
              ref={video}
              data-testid="viewfinder"
              autoPlay
              muted
              playsInline
              aria-label={guide}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
          {preview && phase !== 'live' && (
            <Box
              component="img"
              src={preview.url}
              alt={title}
              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
          {phase === 'live' && (
            <>
              {/* The highlighted frame: dim outside, a dashed chalk border, the instruction above. */}
              <Box
                aria-hidden="true"
                sx={{
                  position: 'absolute',
                  inset: shot === 'board' ? '12% 6% 8%' : '12% 10% 8%',
                  borderRadius: `${shape.md}px`,
                  border: `3px dashed ${chalk.sunflower.container}`,
                  boxShadow: '0 0 0 999px rgba(0,0,0,0.45)',
                  pointerEvents: 'none',
                }}
              />
              <Typography
                variant="titleSmall"
                sx={{
                  position: 'absolute',
                  top: 12,
                  left: 16,
                  right: 16,
                  textAlign: 'center',
                  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                }}
              >
                {guide}
              </Typography>
            </>
          )}
          {phase === 'sending' && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(0,0,0,0.5)',
              }}
            >
              <CircularProgress size={40} color="inherit" />
            </Box>
          )}
          {flash > 0 && (
            <Box
              key={flash}
              aria-hidden="true"
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: '#fff',
                pointerEvents: 'none',
                '@keyframes shutterFlash': { from: { opacity: 0.85 }, to: { opacity: 0 } },
                animation: `shutterFlash 360ms ${motion.easing.emphasizedDecelerate} both`,
                '@media (prefers-reduced-motion: reduce)': { display: 'none' },
              }}
            />
          )}
        </Box>

        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: 2,
            pt: 2,
            pb: 'calc(20px + env(safe-area-inset-bottom))',
            minHeight: 112,
          }}
        >
          {phase === 'live' && (
            <>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Button
                  color="inherit"
                  startIcon={<Upload size={18} />}
                  onClick={onUpload}
                  sx={{ minHeight: 48 }}
                >
                  {c.uploadInstead}
                </Button>
              </Box>
              <IconButton
                ref={shutter}
                aria-label={c.takePhoto}
                onClick={onCapture}
                sx={{
                  width: 84,
                  height: 84,
                  border: `5px solid ${ink}`,
                  '&:active': { transform: 'scale(0.92)' },
                  transition: `transform 120ms ${motion.easing.standard}`,
                }}
              >
                <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: ink }} />
              </IconButton>
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
                {onSkipShot && (
                  <Button
                    color="inherit"
                    startIcon={<SkipForward size={18} />}
                    onClick={onSkipShot}
                    sx={{ minHeight: 48 }}
                  >
                    {c.skipShot}
                  </Button>
                )}
              </Box>
            </>
          )}
          {phase === 'preview' && preview && (
            <>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<RotateCcw size={18} />}
                onClick={onRetake}
                sx={{ minHeight: 56, flex: 1 }}
              >
                {c.retake}
              </Button>
              <Button
                variant="contained"
                startIcon={<Check size={18} />}
                onClick={onUse}
                sx={{ minHeight: 56, flex: 1 }}
              >
                {c.usePhoto}
              </Button>
            </>
          )}
        </Stack>
      </Box>
    </Dialog>
  )
}
