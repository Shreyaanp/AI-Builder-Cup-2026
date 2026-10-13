import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Link,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Camera, Check, Leaf, Lock, Mic, ShieldCheck, Trash2 } from 'lucide-react'
import { useIdentity } from '../../auth/useIdentity'
import { usePreferences, usePreferencesDispatch } from '../../state/hooks'
import { shape } from '../../design/theme'
import { LegalDialog } from './LegalDialog'
import type { LegalDocument } from './LegalDialog'
import { useCopy } from './strings'

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

function LanguageSwitch() {
  const { language } = usePreferences()
  const dispatch = usePreferencesDispatch()
  return (
    <Button
      size="small"
      onClick={() => dispatch({ type: 'language', language: language === 'hi' ? 'en' : 'hi' })}
      lang={language === 'hi' ? 'en' : 'hi'}
      sx={{ alignSelf: 'flex-end', mb: -2 }}
    >
      {language === 'hi' ? 'English' : 'हिन्दी'}
    </Button>
  )
}

export function Splash() {
  const t = useCopy()
  return (
    <Box
      role="status"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeContent: 'center',
        justifyItems: 'center',
        gap: 3,
      }}
    >
      <Mark />
      <Typography variant="titleLarge">{t.appName}</Typography>
      <CircularProgress aria-label={t.loading} />
      <Typography variant="bodyMedium" color="text.secondary">
        {t.loading}
      </Typography>
    </Box>
  )
}

export function Welcome({ onPreview }: { onPreview: () => void }) {
  const t = useCopy()
  const identity = useIdentity()
  const roles = useTheme().material
  const [legal, setLegal] = useState<LegalDocument>(null)
  const features = [
    { icon: <Camera size={22} />, title: t.featurePhoto, body: t.featurePhotoBody },
    { icon: <Mic size={22} />, title: t.featureVoice, body: t.featureVoiceBody },
    { icon: <ShieldCheck size={22} />, title: t.featureControl, body: t.featureControlBody },
  ]
  return (
    <Frame>
      <LanguageSwitch />
      <Mark />
      <Box>
        <Typography component="h1" variant="displaySmall">
          {t.welcomeTitle}
        </Typography>
        <Typography variant="bodyLarge" color="text.secondary" sx={{ mt: 2 }}>
          {t.welcomeBody}
        </Typography>
      </Box>
      <Stack component="ul" spacing={2.5} sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {features.map((feature) => (
          <Stack
            component="li"
            key={feature.title}
            direction="row"
            spacing={2}
            sx={{ alignItems: 'flex-start' }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: 44,
                height: 44,
                flexShrink: 0,
                borderRadius: `${shape.md}px`,
                display: 'grid',
                placeItems: 'center',
                bgcolor: roles.secondaryContainer,
                color: roles.onSecondaryContainer,
              }}
            >
              {feature.icon}
            </Box>
            <Box>
              <Typography variant="titleMedium">{feature.title}</Typography>
              <Typography variant="bodyMedium" color="text.secondary">
                {feature.body}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
      {identity.error && <Alert severity="error">{identity.error}</Alert>}
      <Stack spacing={1.5}>
        {identity.mode === 'local' ? (
          <>
            <Button variant="contained" size="large" onClick={onPreview}>
              {t.continuePreview}
            </Button>
            <Typography variant="bodySmall" color="text.secondary" sx={{ textAlign: 'center' }}>
              {t.previewNote}
            </Typography>
          </>
        ) : identity.status === 'error' ? (
          <Button variant="contained" size="large" onClick={() => location.reload()}>
            {t.retry}
          </Button>
        ) : (
          <Button variant="contained" size="large" onClick={() => void identity.signIn()}>
            {t.signIn}
          </Button>
        )}
      </Stack>
      <Typography variant="bodySmall" color="text.secondary" sx={{ textAlign: 'center' }}>
        {t.independent} ·{' '}
        <Link
          component="button"
          type="button"
          onClick={() => setLegal('terms')}
          variant="bodySmall"
        >
          {t.viewTerms}
        </Link>{' '}
        ·{' '}
        <Link
          component="button"
          type="button"
          onClick={() => setLegal('privacy')}
          variant="bodySmall"
        >
          {t.viewPrivacy}
        </Link>
      </Typography>
      <LegalDialog open={legal} onClose={() => setLegal(null)} />
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
      <LanguageSwitch />
      <Mark />
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
