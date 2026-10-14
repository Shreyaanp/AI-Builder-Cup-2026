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
import { Check, Leaf, Lock, Trash2 } from 'lucide-react'
import { shape } from '../../design/theme'
import { LegalDialog } from './LegalDialog'
import type { LegalDocument } from './LegalDialog'
import { useCopy } from './strings'
import { BrandSplash } from '../frontdoors/Splash'
import { JourneyProgress } from '../frontdoors/OwnerJourney'

function Frame({ children }: { children: ReactNode }) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        px: 3,
        pt: 'calc(48px + env(safe-area-inset-top))',
        pb: 'calc(32px + env(safe-area-inset-bottom))',
      }}
    >
      <Stack spacing={4} sx={{ width: '100%', maxWidth: 480 }}>
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
  const roles = useTheme().material
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [legal, setLegal] = useState<LegalDocument>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const points = [
    { icon: <Lock size={20} />, text: t.consentStore },
    { icon: <Check size={20} />, text: t.consentPurpose },
    { icon: <Trash2 size={20} />, text: t.consentRights },
  ]
  return (
    <Frame>
      <Mark />
      <JourneyProgress step={2} />
      <Box>
        <Typography component="h1" variant="headlineMedium">
          {t.consentTitle}
        </Typography>
        <Typography variant="bodyLarge" color="text.secondary" sx={{ mt: 1.5 }}>
          {t.consentBody}
        </Typography>
      </Box>
      <Stack
        component="ul"
        spacing={2}
        sx={{
          m: 0,
          p: 3,
          listStyle: 'none',
          bgcolor: roles.surfaceContainerLow,
          borderRadius: `${shape.lg}px`,
        }}
      >
        {points.map((point) => (
          <Stack
            component="li"
            key={point.text}
            direction="row"
            spacing={2}
            sx={{ alignItems: 'flex-start' }}
          >
            <Box aria-hidden="true" sx={{ color: roles.primary, pt: 0.25, display: 'flex' }}>
              {point.icon}
            </Box>
            <Typography variant="bodyMedium">{point.text}</Typography>
          </Stack>
        ))}
      </Stack>
      <Stack spacing={0.5}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <FormControlLabel
            control={<Checkbox checked={terms} onChange={(_, checked) => setTerms(checked)} />}
            label={t.acceptTerms}
          />
          <Button
            size="small"
            onClick={() => setLegal('terms')}
            aria-label={`${t.read}: ${t.viewTerms}`}
          >
            {t.read}
          </Button>
        </Stack>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <FormControlLabel
            control={<Checkbox checked={privacy} onChange={(_, checked) => setPrivacy(checked)} />}
            label={t.acceptPrivacy}
          />
          <Button
            size="small"
            onClick={() => setLegal('privacy')}
            aria-label={`${t.read}: ${t.viewPrivacy}`}
          >
            {t.read}
          </Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack spacing={1.5}>
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
        >
          {t.agree}
        </Button>
        <Button onClick={onDecline} disabled={busy}>
          {t.notNow}
        </Button>
      </Stack>
      <Typography variant="bodySmall" color="text.secondary" sx={{ textAlign: 'center' }}>
        {t.draftLegal}
      </Typography>
      <LegalDialog open={legal} onClose={() => setLegal(null)} />
    </Frame>
  )
}
