import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Leaf } from 'lucide-react'
import { shape } from '../../design/theme'
import { LegalDialog } from './LegalDialog'
import type { LegalDocument } from './LegalDialog'
import { useCopy } from './strings'
import { BrandSplash } from '../frontdoors/Splash'
import { JourneyProgress } from '../frontdoors/OwnerJourney'
import { Disclosure } from './Disclosure'
import { useInChatCopy } from './inChatCopy'

function Frame({ children }: { children: ReactNode }) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        px: 2,
        pt: 'calc(48px + env(safe-area-inset-top))',
        pb: 'calc(32px + env(safe-area-inset-bottom))',
      }}
    >
      <Stack spacing={3} sx={{ width: '100%', maxWidth: 480 }}>
        {children}
      </Stack>
    </Box>
  )
}

function Mark() {
  const roles = useTheme().material
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 56,
        height: 56,
        borderRadius: `${shape.lg}px`,
        display: 'grid',
        placeItems: 'center',
        bgcolor: roles.primaryContainer,
        color: roles.onPrimaryContainer,
      }}
    >
      <Leaf size={30} />
    </Box>
  )
}

export function Splash() {
  return <BrandSplash business />
}

/** Signed in, but the account could not be loaded: recover without showing marketing again. */
export function AccountError({ onSignOut }: { onSignOut: () => void | Promise<void> }) {
  const t = useCopy()
  return (
    <Frame>
      <Mark />
      <Typography component="h1" variant="headlineSmall">
        {t.accountFailed}
      </Typography>
      <Typography variant="bodyLarge" color="text.secondary">
        {t.accountFailedBody}
      </Typography>
      <Stack spacing={1.5}>
        <Button variant="contained" size="large" onClick={() => location.reload()}>
          {t.retry}
        </Button>
        <Button onClick={() => void onSignOut()}>{t.signOut}</Button>
      </Stack>
    </Frame>
  )
}

export function ConsentScreen({
  onAccept,
  onDecline,
}: {
  onAccept: () => Promise<void>
  onDecline: () => void
}) {
  const t = useCopy()
  const c = useInChatCopy()
  const [step, setStep] = useState(0)
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [legal, setLegal] = useState<LegalDocument>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Frame>
      <Mark />
      <JourneyProgress step={2} />
      <Typography component="h1" variant="headlineMedium">{t.consentTitle}</Typography>
      <Typography variant="bodyLarge" color="text.secondary">
        {step === 0 ? t.consentPurpose : t.consentStore}
      </Typography>
      <Button onClick={() => setLegal(step === 0 ? 'terms' : 'privacy')} sx={{ minHeight: 48 }}>
        {t.read}: {step === 0 ? t.viewTerms : t.viewPrivacy}
      </Button>
      <FormControlLabel
        control={<Checkbox checked={step === 0 ? terms : privacy} onChange={(_, checked) => step === 0 ? setTerms(checked) : setPrivacy(checked)} sx={{ minWidth: 48, minHeight: 48 }} />}
        label={step === 0 ? t.acceptTerms : t.acceptPrivacy}
      />
      <Disclosure>
        <Stack spacing={2}>
          <Typography>{t.consentBody}</Typography>
          <Typography>{t.consentRights}</Typography>
          <Typography>{t.draftLegal}</Typography>
        </Stack>
      </Disclosure>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack spacing={1.5} sx={{ mt: 'auto' }}>
        {step === 0 ? (
          <Button variant="contained" size="large" disabled={!terms} onClick={() => setStep(1)} sx={{ minHeight: 56 }}>{c.next}</Button>
        ) : (
          <Button
            variant="contained"
            size="large"
            disabled={!terms || !privacy || busy}
            startIcon={busy ? <CircularProgress size={18} /> : undefined}
            onClick={() => {
              setBusy(true)
              setError('')
              onAccept().catch(() => {
                setError(t.actionFailed)
                setBusy(false)
              })
            }}
            sx={{ minHeight: 56 }}
          >{t.agree}</Button>
        )}
        {step === 1 && <Button disabled={busy} onClick={() => setStep(0)}>{c.back}</Button>}
        <Button onClick={onDecline} disabled={busy}>{t.notNow}</Button>
      </Stack>
      <LegalDialog open={legal} onClose={() => setLegal(null)} />
    </Frame>
  )
}
