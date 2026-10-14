import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { FileText, ScanFace, ShieldCheck, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocale } from '../../../state/hooks'
import { formatDate } from '../format'
import { LegalDialog } from '../LegalDialog'
import type { LegalDocument } from '../LegalDialog'
import { useBackClose } from '../backStack'
import { useCopy } from '../strings'
import { useWorkspace } from '../workspaceContext'
import { shape } from '../../../design/theme'

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  const roles = useTheme().material
  return (
    <Box
      component="section"
      sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px`, p: 3 }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.5 }}>
        <Box aria-hidden="true" sx={{ color: roles.primary, display: 'flex' }}>
          {icon}
        </Box>
        <Typography component="h2" variant="titleMedium">
          {title}
        </Typography>
      </Stack>
      {children}
    </Box>
  )
}

export function PrivacyScreen() {
  const t = useCopy()
  const language = useLocale()
  const ws = useWorkspace()
  const [legal, setLegal] = useState<LegalDocument>(null)
  // Destructive actions always confirm first.
  const [confirming, setConfirming] = useState<'none' | 'all' | 'face'>('none')
  const [busy, setBusy] = useState(false)
  const pending = ws.businesses.some((shop) => shop.registration === 'verification_pending')
  useBackClose(confirming !== 'none', () => !busy && setConfirming('none'))

  async function deleteFace() {
    setBusy(true)
    try {
      await ws.api('/face/template', { method: 'DELETE' })
      await ws.reload()
      ws.notify(t.faceDeleted)
    } catch {
      ws.notify(t.actionFailed)
    } finally {
      setBusy(false)
      setConfirming('none')
    }
  }

  async function eraseEverything() {
    setBusy(true)
    try {
      await ws.api('/me/data', { method: 'DELETE' })
      ws.notify(t.deleted)
      // Consent was erased too; restart into the welcome/consent flow.
      setTimeout(() => location.reload(), 900)
    } catch {
      ws.notify(t.actionFailed)
      setBusy(false)
      setConfirming('none')
    }
  }

  return (
    <Box component="section" aria-label={t.navPrivacy} sx={{ maxWidth: 760, mx: 'auto', pt: 2 }}>
      <Typography component="h1" variant="headlineMedium" sx={{ mb: 3 }}>
        {t.privacyTitle}
      </Typography>
      <Stack spacing={2}>
        <Section icon={<FileText size={22} />} title={t.consentSection}>
          <Typography variant="bodyMedium" color="text.secondary">
            {ws.me.consent ? t.consentAccepted(formatDate(ws.me.consent.accepted, language)) : ''}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" onClick={() => setLegal('terms')}>
              {t.viewTerms}
            </Button>
            <Button variant="outlined" onClick={() => setLegal('privacy')}>
              {t.viewPrivacy}
            </Button>
          </Stack>
        </Section>

        <Section icon={<ScanFace size={22} />} title={t.faceSection}>
          <Typography variant="bodyMedium" color="text.secondary">
            {t.faceBody}
          </Typography>
          <Chip
            size="small"
            label={t.faceStatus[pending ? 'review_pending' : 'not_enrolled']}
            sx={{ mt: 1.5 }}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
            <Button variant="contained" disabled={!ws.active} onClick={() => ws.setFaceOpen(true)}>
              {t.faceStart}
            </Button>
            <Button color="error" onClick={() => setConfirming('face')}>
              {t.faceDelete}
            </Button>
          </Stack>
          {!ws.active && (
            <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {t.faceNeedsShop}
            </Typography>
          )}
        </Section>

        <Section icon={<ShieldCheck size={22} />} title={t.dataSection}>
          <Typography variant="bodyMedium" color="text.secondary">
            {t.dataBody}
          </Typography>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Trash2 size={18} />}
            sx={{ mt: 2 }}
            onClick={() => setConfirming('all')}
          >
            {t.deleteAll}
          </Button>
        </Section>
      </Stack>

      <LegalDialog open={legal} onClose={() => setLegal(null)} />
      <Dialog
        open={confirming !== 'none'}
        onClose={() => !busy && setConfirming('none')}
        aria-labelledby="erase-title"
      >
        <DialogTitle id="erase-title">
          {confirming === 'face' ? t.faceDeleteTitle : t.deleteTitle}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirming === 'face' ? t.faceDeleteBody : t.deleteBody}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button disabled={busy} onClick={() => setConfirming('none')}>
            {t.cancel}
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy}
            onClick={() => void (confirming === 'face' ? deleteFace() : eraseEverything())}
          >
            {t.deleteConfirm}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
