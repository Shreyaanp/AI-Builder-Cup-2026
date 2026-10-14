import { useEffect, useState } from 'react'
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { Download, Share2 } from 'lucide-react'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { shape } from '../../design/theme'
import { FONT_STACK } from '../../i18n/fonts'

const SIZE = 1024
// Print-friendly: black on white in every theme, generous quiet zone, medium error correction.
const QR_OPTIONS = {
  width: SIZE,
  margin: 4,
  errorCorrectionLevel: 'M' as const,
  color: { dark: '#000000', light: '#ffffff' },
}

/** Draws QR + shop name + caption on one white card and returns it as a PNG. */
async function poster(qr: string, name: string, caption: string): Promise<Blob> {
  const image = new Image()
  image.src = qr
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE + 240
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, SIZE, SIZE)
  context.fillStyle = '#000000'
  context.textAlign = 'center'
  context.font = `600 64px ${FONT_STACK}`
  context.fillText(name, SIZE / 2, SIZE + 70, SIZE - 96)
  context.font = `400 44px ${FONT_STACK}`
  context.fillText(caption, SIZE / 2, SIZE + 150, SIZE - 96)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG failed'))), 'image/png'),
  )
}

/** QR code for the shared customer page, with share (Web Share) or download of a print PNG. */
export function ShopQr({ url, name }: { url: string; name: string }) {
  const qrUrl = new URL(url, location.origin)
  qrUrl.searchParams.set('source', 'qr')
  const stampedUrl = qrUrl.href
  const t = useCopy()
  const ws = useWorkspace()
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null)
  useEffect(() => {
    let live = true
    // Loaded on demand so the QR encoder never ships in the main bundle.
    void import('qrcode')
      .then((module) => module.toDataURL(stampedUrl, QR_OPTIONS))
      .then((data) => {
        if (live) setQr({ url, data })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [url, stampedUrl])
  const data = qr?.url === url ? qr.data : null
  const file = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'shop'}-qr.png`

  async function shareOrDownload(share: boolean) {
    if (!data) return
    try {
      const blob = await poster(data, name, t.qrCaption)
      const png = new File([blob], file, { type: 'image/png' })
      if (share && navigator.canShare?.({ files: [png] })) {
        await navigator.share({ files: [png], title: name, text: t.qrCaption })
        return
      }
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = file
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
    } catch (error) {
      // A cancelled share sheet is not an error worth showing.
      if (!(error instanceof DOMException && error.name === 'AbortError')) ws.notify(t.actionFailed)
    }
  }

  const canShareFiles = typeof navigator.canShare === 'function'
  return (
    <Stack spacing={3} sx={{ alignItems: 'center' }}>
      <Box
        sx={{
          bgcolor: '#ffffff',
          color: '#000000',
          borderRadius: `${shape.lg}px`,
          p: 4,
          width: '100%',
          maxWidth: 320,
          textAlign: 'center',
        }}
      >
        {data ? (
          <Box
            component="img"
            src={data}
            alt={t.qrAlt(name)}
            sx={{ display: 'block', width: '100%', aspectRatio: '1', imageRendering: 'pixelated' }}
          />
        ) : (
          <Box sx={{ aspectRatio: '1', display: 'grid', placeItems: 'center' }}>
            <CircularProgress aria-label={t.qrAlt(name)} sx={{ color: '#000000' }} />
          </Box>
        )}
        <Typography variant="titleMedium" sx={{ mt: 2, overflowWrap: 'anywhere' }}>
          {name}
        </Typography>
        <Typography variant="bodyMedium">{t.qrCaption}</Typography>
      </Box>
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        {canShareFiles && (
          <Button
            variant="contained"
            startIcon={<Share2 size={18} />}
            disabled={!data}
            onClick={() => void shareOrDownload(true)}
          >
            {t.qrShare}
          </Button>
        )}
        <Button
          variant={canShareFiles ? 'outlined' : 'contained'}
          startIcon={<Download size={18} />}
          disabled={!data}
          onClick={() => void shareOrDownload(false)}
        >
          {t.qrDownload}
        </Button>
      </Stack>
    </Stack>
  )
}
