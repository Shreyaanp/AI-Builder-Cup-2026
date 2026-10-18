import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { Download, Share2 } from 'lucide-react'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { shape } from '../../design/theme'
import { FONT_STACK } from '../../i18n/fonts'
import './shopQr.css'

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

/** Shared stamp QR, A4/A5 browser printing, and the existing PNG share/download actions. */
export function ShopQr({
  url,
  name,
  printOnly = false,
}: {
  url: string
  name: string
  printOnly?: boolean
}) {
  const t = useCopy()
  const ws = useWorkspace()
  const shopId = ws.active?.id
  const api = ws.api
  const [paper, setPaper] = useState<'A4' | 'A5'>('A4')
  const [attempt, retry] = useState(0)
  const [failed, setFailed] = useState(false)
  // The passport key printed into the QR: a scan plus a location fix at the shop earns a stamp.
  const [passportKey, setPassportKey] = useState<{ shop: string; key: string } | null>(null)
  useEffect(() => {
    if (!shopId) return
    let live = true
    api<{ key: string }>(`/businesses/${encodeURIComponent(shopId)}/qr-key`)
      .then((value) => live && setPassportKey({ shop: shopId, key: value.key }))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [shopId, api, attempt])
  const key = passportKey && passportKey.shop === shopId ? passportKey.key : null
  const qrUrl = new URL(url, location.origin)
  qrUrl.searchParams.set('source', 'qr')
  if (key) qrUrl.searchParams.set('k', key)
  const stampedUrl = qrUrl.href
  const [qr, setQr] = useState<{ url: string; data: string } | null>(null)
  useEffect(() => {
    if (key === null && shopId) return
    let live = true
    // Loaded on demand so the QR encoder never ships in the main bundle.
    void import('qrcode')
      .then((module) => module.toDataURL(stampedUrl, QR_OPTIONS))
      .then((data) => {
        if (live) setQr({ url: stampedUrl, data })
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [stampedUrl, key, shopId, attempt])
  const data = qr?.url === stampedUrl ? qr.data : null
  const file = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'shop'}-qr.png`

  async function shareOrDownload(share: boolean) {
    if (!data) return
    try {
      const blob = await poster(data, name, t.scanStamps)
      const png = new File([blob], file, { type: 'image/png' })
      if (share && navigator.canShare?.({ files: [png] })) {
        await navigator.share({ files: [png], title: name, text: t.scanStamps })
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

  const canShareFiles = !printOnly && typeof navigator.canShare === 'function'
  const artwork = (
    <>
      <Typography
        component="h2"
        variant="headlineSmall"
        className="shop-qr-name"
        sx={{ overflowWrap: 'anywhere' }}
      >
        {name}
      </Typography>
      <Typography component="p" variant="titleLarge" className="shop-qr-caption">
        {t.scanStamps}
      </Typography>
      {data ? (
        <Box
          component="img"
          className="shop-qr-code"
          src={data}
          alt={t.qrAlt(name)}
          width={SIZE}
          height={SIZE}
          sx={{
            display: 'block',
            width: '100%',
            height: 'auto',
            aspectRatio: '1',
            imageRendering: 'pixelated',
          }}
        />
      ) : (
        <Box sx={{ aspectRatio: '1', display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label={t.qrAlt(name)} sx={{ color: '#000000' }} />
        </Box>
      )}
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center', justifyContent: 'center' }}>
        <img src="/icons/customer.svg" width={32} height={32} alt="" />
        <Typography component="span" variant="titleMedium" translate="no">
          {t.appName}
        </Typography>
      </Stack>
    </>
  )
  return (
    <Stack spacing={3} sx={{ alignItems: 'center' }}>
      {failed && (
        <Alert
          severity="error"
          action={
            <Button
              onClick={() => {
                setFailed(false)
                retry((n) => n + 1)
              }}
            >
              {t.retry}
            </Button>
          }
        >
          {t.actionFailed}
        </Alert>
      )}
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
        {artwork}
      </Box>
      <ToggleButtonGroup
        exclusive
        value={paper}
        aria-label={t.paperSize}
        sx={{ '& .MuiToggleButton-root': { color: 'text.primary', minWidth: 48, minHeight: 48 } }}
        onChange={(_, value: 'A4' | 'A5' | null) => {
          if (value) setPaper(value)
        }}
      >
        <ToggleButton value="A4">A4</ToggleButton>
        <ToggleButton value="A5">A5</ToggleButton>
      </ToggleButtonGroup>
      <Button
        variant="contained"
        startIcon={<Download size={18} />}
        disabled={!data || failed}
        onClick={() => window.print()}
      >
        {t.downloadPdf}
      </Button>
      {data &&
        createPortal(
          <div className={`shop-qr-print shop-qr-${paper.toLowerCase()}`} aria-hidden="true">
            <style>{`@media print { @page { size: ${paper} portrait; margin: 0; } }`}</style>
            {artwork}
          </div>,
          document.body,
        )}
      {!printOnly && (
        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
          {canShareFiles && (
            <Button
              variant="outlined"
              startIcon={<Share2 size={18} />}
              disabled={!data}
              onClick={() => void shareOrDownload(true)}
            >
              {t.qrShare}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<Download size={18} />}
            disabled={!data}
            onClick={() => void shareOrDownload(false)}
          >
            {t.qrDownload}
          </Button>
        </Stack>
      )}
    </Stack>
  )
}
