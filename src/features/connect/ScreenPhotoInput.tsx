import { useRef } from 'react'
import { Button, CircularProgress, Stack, Typography } from '@mui/material'
import { Camera, Images } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { photoCopy } from './photoCopy'
import { AiInfo } from '../v1/AiInfo'

export function ScreenPhotoInput({
  photos,
  busy,
  onPhotos,
  onRead,
  onError,
}: {
  photos: File[]
  busy: boolean
  onPhotos: (photos: File[]) => void
  onRead: () => void
  onError: (message: string) => void
}) {
  const t = photoCopy[useLocale()]
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  function add(files: FileList | null) {
    if (!files) return
    const selected = [...photos, ...Array.from(files)]
    if (selected.length > 8 || selected.reduce((size, file) => size + file.size, 0) > 20_000_000) {
      onError(t.failed)
    } else {
      onError('')
      onPhotos(selected)
    }
    for (const input of [camera, gallery]) if (input.current) input.current.value = ''
  }

  return (
    <>
      <Typography variant="titleSmall">{t.title}</Typography>
      <AiInfo feature="photo" inSheet />
      <input
        ref={camera}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        tabIndex={-1}
        data-testid="screen-camera"
        onChange={(event) => add(event.target.files)}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        tabIndex={-1}
        data-testid="screen-gallery"
        onChange={(event) => add(event.target.files)}
      />
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Button
          disabled={busy}
          startIcon={<Camera size={18} />}
          onClick={() => camera.current?.click()}
          sx={{ minHeight: 48 }}
        >
          {t.camera}
        </Button>
        <Button
          disabled={busy}
          startIcon={<Images size={18} />}
          onClick={() => gallery.current?.click()}
          sx={{ minHeight: 48 }}
        >
          {t.gallery}
        </Button>
      </Stack>
      {photos.length > 0 && (
        <>
          <Typography role="status" variant="bodyMedium">
            {t.selected}: {photos.length}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              disabled={busy}
              onClick={onRead}
              startIcon={busy ? <CircularProgress size={18} /> : undefined}
              sx={{ minHeight: 48 }}
            >
              {t.read}
            </Button>
            <Button disabled={busy} onClick={() => onPhotos([])} sx={{ minHeight: 48 }}>
              {t.clear}
            </Button>
          </Stack>
        </>
      )}
    </>
  )
}
