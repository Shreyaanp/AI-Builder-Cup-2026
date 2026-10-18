import { useState } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { useIdentity } from '../../auth/useIdentity'
import { JourneyProgress } from '../frontdoors/OwnerJourney'
import { Disclosure } from './Disclosure'
import { Landing } from './Landing'
import { LegalDialog, type LegalDocument } from './LegalDialog'
import { Sheet } from './Sheet'
import { useCopy } from './strings'
import { TrustStrip } from './TrustStrip'

/** Sign-in gets one screen; the existing business introduction stays one tap away. */
export function OwnerFrontDoor({ onPreview }: { onPreview: () => void }) {
  const t = useCopy()
  const identity = useIdentity()
  const [more, setMore] = useState(false)
  const [legal, setLegal] = useState<LegalDocument>(null)
  return (
    <Box component="main" sx={{ minHeight: '100dvh', maxWidth: 480, mx: 'auto', px: 2, pt: 'calc(32px + env(safe-area-inset-top))', pb: 'calc(16px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="titleLarge" translate="no">{t.appName}</Typography>
      <JourneyProgress step={1} />
      <Typography component="h1" variant="headlineMedium">{t.welcomeTitle}</Typography>
      <Disclosure><TrustStrip /><Typography>{t.independent}</Typography></Disclosure>
      {identity.error && <Alert severity="error">{identity.error}</Alert>}
      <Stack spacing={1} sx={{ mt: 'auto' }}>
        <Button variant="contained" sx={{ minHeight: 56 }} onClick={() => {
          if (identity.mode === 'local') onPreview()
          else if (identity.status === 'error') location.reload()
          else void identity.signIn()
        }}>{identity.mode === 'local' ? t.continuePreview : identity.status === 'error' ? t.retry : t.signIn}</Button>
        {identity.mode === 'local' && <Typography variant="bodyMedium">{t.previewNote}</Typography>}
        <Button onClick={() => setMore(true)}>{t.howTitle}</Button>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={() => setLegal('terms')}>{t.viewTerms}</Button>
          <Button onClick={() => setLegal('privacy')}>{t.viewPrivacy}</Button>
        </Stack>
      </Stack>
      <Sheet open={more} onClose={() => setMore(false)} titleId="owner-introduction" title={t.howTitle}>
        {more && <Landing onPreview={onPreview} />}
      </Sheet>
      <LegalDialog open={legal} onClose={() => setLegal(null)} />
    </Box>
  )
}
