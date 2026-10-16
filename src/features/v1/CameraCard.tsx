import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { Camera, Check, RotateCcw, SkipForward, Upload, X } from 'lucide-react'
import { enterRise, motion, shape } from '../../design/theme'
import { useInChatCopy } from './inChatCopy'
import { useVoiceModeCopy } from './voiceModeCopy'

export type Shot = 'board' | 'front'
type Problem = 'blocked' | 'no-camera' | 'failed'
type Phase = 'ask' | 'starting' | 'live' | 'preview' | 'sending' | 'problem'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

async function cameraPermission(): Promise<PermissionState> {
  try {
    return (await navigator.permissions.query({ name: 'camera' as PermissionName })).state
  } catch {
    return 'prompt'
  }
}

/**
 * The camera as a card in the conversation (never full screen): the coach's instruction over a
 * guide frame, shutter, retake and "Use photo", one shot after another (price board, then the
 * shopfront), with upload as the fallback. Only video is requested, so the voice mic carries on.
 */
export function CameraCard({
  shots,
  onPhoto,
  onClose,
  onActive,
}: {
  shots: Shot[]
  /** Reads the photo into the shop (the conversation shows the result). */
  onPhoto: (file: File) => Promise<void>
  onClose: () => void
  /** The owner is using the camera (the coach waits instead of nudging). */
  onActive?: () => void
}) {
  const c = useInChatCopy()
  const v = useVoiceModeCopy()
  const roles = useTheme().material
  const chalk = useTheme().chalk
  const [phase, setPhase] = useState<Phase>('ask')
  const [problem, setProblem] = useState<Problem>('failed')
  const [index, setIndex] = useState(0)
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null)
  const [flash, setFlash] = useState(0)
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
  // Already allowed: straight to the viewfinder. Otherwise the reason comes first, then the ask.
  useEffect(() => {
    let alive = true
    void cameraPermission().then((state) => {
      if (alive && state === 'granted') void start()
    })
    return () => {
      alive = false
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
      onClose()
    }
  }
  async function send(file: File) {
    setPhase('sending')
    try {
      await onPhoto(file)
    } finally {
      advance()
    }
  }
  function close() {
    stop()
    onClose()
  }

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
          <IconButton aria-label={c.closeCamera} onClick={close} sx={{ mr: -1 }}>
            <X size={20} />
          </IconButton>
        </Tooltip>
      </Stack>

      {phase === 'ask' && (
        <Stack spacing={2}>
          <Typography variant="bodyMedium" color="text.secondary">
            {c.cameraWhy}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<Camera size={18} />}
              onClick={() => void start()}
              sx={{ minHeight: 48 }}
            >
              {c.openCamera}
            </Button>
            {uploadButton}
          </Stack>
        </Stack>
      )}

      {phase === 'problem' && (
        <Alert
          data-testid="camera-alert"
          data-problem={problem}
          severity="warning"
          onClose={close}
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

      {(phase === 'starting' || phase === 'live' || phase === 'preview' || phase === 'sending') && (
        <Stack spacing={1.5}>
          <Box
            sx={{
              position: 'relative',
              aspectRatio: '4 / 3',
              maxHeight: { xs: 300, md: 360 },
              width: '100%',
              mx: 'auto',
              borderRadius: `${shape.md}px`,
              overflow: 'hidden',
              bgcolor: '#111',
            }}
          >
            {phase === 'starting' && (
              <Stack
                sx={{
                  position: 'absolute',
                  inset: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  color: '#fff',
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
                {/* The guide frame: dim outside, chalk corners, the instruction on top. */}
                <Box
                  aria-hidden="true"
                  sx={{
                    position: 'absolute',
                    inset: shot === 'board' ? '16% 8% 10%' : '16% 14% 8%',
                    borderRadius: `${shape.sm}px`,
                    border: `2px dashed ${chalk.sunflower.container}`,
                    boxShadow: '0 0 0 999px rgba(0,0,0,0.38)',
                    pointerEvents: 'none',
                  }}
                />
                <Typography
                  variant="labelLarge"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    right: 8,
                    textAlign: 'center',
                    color: '#fff',
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
                  bgcolor: 'rgba(0,0,0,0.4)',
                  color: '#fff',
                }}
              >
                <CircularProgress size={32} color="inherit" />
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

          {phase === 'live' && (
            <Stack
              direction="row"
              sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
            >
              <Box sx={{ flex: 1 }}>
                {shots.length > 1 && (
                  <Button
                    startIcon={<SkipForward size={18} />}
                    onClick={advance}
                    sx={{ minHeight: 48 }}
                  >
                    {c.skipShot}
                  </Button>
                )}
              </Box>
              <IconButton
                ref={shutter}
                aria-label={c.takePhoto}
                onClick={capture}
                sx={{
                  width: 68,
                  height: 68,
                  border: `4px solid ${roles.primary}`,
                  bgcolor: roles.surface,
                  '&:hover': { bgcolor: roles.surfaceContainerHigh },
                  '&:active': { transform: 'scale(0.92)' },
                  transition: `transform 120ms ${motion.easing.standard}`,
                }}
              >
                <Box sx={{ width: 46, height: 46, borderRadius: '50%', bgcolor: roles.primary }} />
              </IconButton>
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <Tooltip title={c.uploadInstead}>
                  <IconButton aria-label={c.uploadInstead} onClick={() => upload.current?.click()}>
                    <Upload size={22} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Stack>
          )}
          {phase === 'preview' && preview && (
            <Stack direction="row" sx={{ gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<RotateCcw size={18} />}
                onClick={() => {
                  setPreview(null)
                  setPhase('live')
                }}
                sx={{ minHeight: 48 }}
              >
                {c.retake}
              </Button>
              <Button
                variant="contained"
                startIcon={<Check size={18} />}
                onClick={() => void send(preview.file)}
                sx={{ minHeight: 48 }}
              >
                {c.usePhoto}
              </Button>
            </Stack>
          )}
        </Stack>
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
