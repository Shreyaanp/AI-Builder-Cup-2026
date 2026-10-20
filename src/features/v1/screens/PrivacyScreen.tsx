import { useState } from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { FileText, Lightbulb, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocale } from '../../../state/hooks'
import type { EraseResult } from '../api'
import { formatDate } from '../format'
import { LegalDialog } from '../LegalDialog'
import type { LegalDocument } from '../LegalDialog'
import { useBackClose } from '../backStack'
import { useCopy } from '../strings'
import { useWorkspace } from '../workspaceContext'
import { PlaybookEntry } from '../playbook/ShopPlaybook'
import { usePlaybookCopy } from '../playbook/playbookCopy'
import { shape } from '../../../design/theme'
import { TrustCard } from '../../trust/TrustCard'
import { useIdentity } from '../../../auth/useIdentity'

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

type EraseState =
  { kind: 'idle' | 'working' | 'done' | 'failed' } | { kind: 'partial'; pending: string[] }

export function PrivacyScreen() {
  const t = useCopy()
  const playbook = usePlaybookCopy()
  const language = useLocale()
  const ws = useWorkspace()
  const identity = useIdentity()
  const [legal, setLegal] = useState<LegalDocument>(null)
  // Destructive actions always confirm first.
  const [confirming, setConfirming] = useState(false)
  // "Delete all my data": each server step reports on its own, so a partial result is shown with
  // what is still pending (the server also retries it) and a Try again.
  const [erase, setErase] = useState<EraseState>(() =>
    ws.me.erase_pending?.length
      ? { kind: 'partial', pending: ws.me.erase_pending }
      : { kind: 'idle' },
  )
  useBackClose(confirming, () => setConfirming(false))

  async function eraseEverything() {
    setConfirming(false)
    setErase({ kind: 'working' })
    try {
      const result = await ws.api<EraseResult>('/me/data', { method: 'DELETE' })
      if (result.status === 'erased') {
        setErase({ kind: 'done' })
        // Stop shop-scoped polls before sign-out changes the identity tree.
        ws.select(null)
        await identity.signOut('deleted')
      } else {
        setErase({ kind: 'partial', pending: result.pending })
      }
    } catch {
      setErase({ kind: 'failed' })
    }
  }

  const pendingItems = (steps: string[]) =>
    new Intl.ListFormat(language, { type: 'conjunction' }).format(
      steps.map((step) => t.eraseSteps[step] ?? step),
    )

  return (
    <Box component="section" aria-label={t.navPrivacy} sx={{ maxWidth: 720, mx: 'auto', pt: 2 }}>
      <Typography component="h1" variant="headlineMedium" sx={{ mb: 3 }}>
        {t.privacyTitle}
      </Typography>
      <Stack spacing={2}>
        <Section icon={<Lightbulb size={22} />} title={playbook.title}>
          <PlaybookEntry />
        </Section>
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

        <TrustCard />

        <Section icon={<ShieldCheck size={22} />} title={t.dataSection}>
          <Typography variant="bodyMedium" color="text.secondary">
            {t.dataBody}
          </Typography>
          {(erase.kind === 'idle' || erase.kind === 'working') && !ws.demo && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<Trash2 size={18} />}
              sx={{ mt: 2 }}
              disabled={erase.kind === 'working'}
              onClick={() => setConfirming(true)}
            >
              {t.deleteAll}
            </Button>
          )}
          {(erase.kind === 'idle' || erase.kind === 'working') && ws.demo && (
            <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 2 }}>
              {ws.readOnlyMessage}
            </Typography>
          )}
          <Box role="status" aria-live="polite" sx={{ mt: erase.kind === 'idle' ? 0 : 2 }}>
            {erase.kind === 'working' && (
              <>
                <Typography variant="bodyMedium">{t.erasing}</Typography>
                <LinearProgress aria-label={t.erasing} sx={{ mt: 1, borderRadius: 1 }} />
              </>
            )}
            {erase.kind === 'done' && (
              <Alert severity="success" role="presentation">
                {t.eraseDone}
              </Alert>
            )}
          </Box>
          {(erase.kind === 'partial' || erase.kind === 'failed') && (
            <Alert severity={erase.kind === 'partial' ? 'warning' : 'error'} sx={{ mt: 2 }}>
              {erase.kind === 'partial' ? (
                <>
                  <AlertTitle>{t.erasePartialTitle}</AlertTitle>
                  {t.erasePartialBody(pendingItems(erase.pending))}
                </>
              ) : (
                t.eraseFailed
              )}
              {/* Below the text, not as the Alert action: long translations stay readable. */}
              <Box sx={{ mt: 1.5 }}>
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<RotateCcw size={18} />}
                  onClick={() => void eraseEverything()}
                >
                  {t.eraseRetry}
                </Button>
              </Box>
            </Alert>
          )}
        </Section>
      </Stack>

      <LegalDialog open={legal} onClose={() => setLegal(null)} />
      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby="erase-title">
        <DialogTitle id="erase-title">{t.deleteTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t.deleteBody}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setConfirming(false)}>{t.cancel}</Button>
          <Button variant="contained" color="error" onClick={() => void eraseEverything()}>
            {t.deleteConfirm}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
