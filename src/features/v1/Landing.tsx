import { useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Box, Button, Link, Stack, Typography, useTheme } from '@mui/material'
import {
  Camera,
  CheckCircle2,
  Languages,
  Leaf,
  MapPin,
  MessageCircle,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useIdentity } from '../../auth/useIdentity'
import { shape } from '../../design/theme'
import { LegalDialog } from './LegalDialog'
import type { LegalDocument } from './LegalDialog'
import { useCopy } from './strings'
import { formatPrice, toMinor } from './format'
import { regionAt } from '../../region/region'
import { JourneyProgress } from '../frontdoors/OwnerJourney'

/** Public landing page (signed-out). Phone-first; two-column hero with a live-preview mock on wide screens. */
/** The sample item fits where the phone is: kopi in Singapore, chai in India. */
function previewItem(kopi: string): string {
  const region = regionAt()
  if (region.country === 'SG' || !region.country) return kopi
  return region.askItem.charAt(0).toUpperCase() + region.askItem.slice(1)
}
function previewPrice(): number {
  const region = regionAt()
  return toMinor(region.askBudget / 2, region.currency)
}

export function Landing({ onPreview }: { onPreview: () => void }) {
  const t = useCopy()
  const roles = useTheme().material
  const [legal, setLegal] = useState<LegalDocument>(null)
  const section = { maxWidth: 1080, mx: 'auto', px: { xs: 3, md: 4 } }

  return (
    <Box sx={{ bgcolor: roles.surface, minHeight: '100dvh' }}>
      <Box
        component="header"
        sx={{
          ...section,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          pt: 'calc(16px + env(safe-area-inset-top))',
          pb: 1,
        }}
      >
        <Box aria-hidden="true" sx={{ color: roles.primary, display: 'flex' }}>
          <Leaf size={26} />
        </Box>
        <Typography variant="titleLarge" sx={{ flex: 1 }} translate="no">
          {t.appName}
        </Typography>
      </Box>

      <Box component="main">
        {/* Hero */}
        <Box
          sx={{
            ...section,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
            gap: { xs: 5, md: 8 },
            alignItems: 'center',
            pt: { xs: 4, md: 8 },
            pb: { xs: 6, md: 10 },
          }}
        >
          <Stack spacing={3}>
            <JourneyProgress step={1} />
            <Typography variant="labelLarge" sx={{ color: roles.primary }}>
              {t.landingEyebrow}
            </Typography>
            <Typography
              component="h1"
              variant="displaySmall"
              sx={{ fontSize: { md: '3.25rem' }, lineHeight: { md: 1.1 }, textWrap: 'balance' }}
            >
              {t.welcomeTitle}
            </Typography>
            <Typography variant="bodyLarge" color="text.secondary" sx={{ maxWidth: 560 }}>
              {t.welcomeBody}
            </Typography>
            <SignInActions onPreview={onPreview} />
          </Stack>
          <PhonePreview />
        </Box>

        {/* How it works */}
        <Box sx={{ bgcolor: roles.surfaceContainerLow, py: { xs: 6, md: 9 } }}>
          <Box sx={section}>
            <Typography component="h2" variant="headlineMedium" sx={{ mb: 4 }}>
              {t.howTitle}
            </Typography>
            <Box
              component="ol"
              sx={{
                m: 0,
                p: 0,
                listStyle: 'none',
                display: 'grid',
                gap: 3,
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
              }}
            >
              <Step n={1} icon={<Camera size={24} />} title={t.step1} body={t.step1Body} />
              <Step n={2} icon={<CheckCircle2 size={24} />} title={t.step2} body={t.step2Body} />
              <Step n={3} icon={<Share2 size={24} />} title={t.step3} body={t.step3Body} />
            </Box>
          </Box>
        </Box>

        {/* Customers + trust */}
        <Box
          sx={{
            ...section,
            py: { xs: 6, md: 9 },
            display: 'grid',
            gap: { xs: 5, md: 8 },
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          }}
        >
          <Feature
            title={t.customersTitle}
            items={[
              { icon: <Search size={20} />, text: t.customer1 },
              { icon: <Languages size={20} />, text: t.customer2 },
              { icon: <MapPin size={20} />, text: t.customer3 },
            ]}
          />
          <Feature
            title={t.trustTitle}
            items={[
              { icon: <ShieldCheck size={20} />, text: t.trust1 },
              { icon: <Trash2 size={20} />, text: t.trust2 },
              { icon: <MessageCircle size={20} />, text: t.trust3 },
            ]}
          />
        </Box>

        {/* Closing call to action */}
        <Box sx={{ ...section, pb: { xs: 6, md: 10 } }}>
          <Stack
            spacing={2.5}
            sx={{
              bgcolor: roles.primaryContainer,
              color: roles.onPrimaryContainer,
              borderRadius: `${shape.xl}px`,
              p: { xs: 3, md: 6 },
              alignItems: { md: 'flex-start' },
            }}
          >
            <Typography component="h2" variant="headlineMedium">
              {t.ctaTitle}
            </Typography>
            <SignInActions onPreview={onPreview} compact />
          </Stack>
        </Box>
      </Box>

      <Box
        component="footer"
        sx={{ ...section, pb: 'calc(24px + env(safe-area-inset-bottom))', textAlign: 'center' }}
      >
        <Typography variant="bodySmall" color="text.secondary">
          {t.independent} ·{' '}
          <Link
            component="button"
            type="button"
            variant="bodySmall"
            onClick={() => setLegal('terms')}
          >
            {t.viewTerms}
          </Link>{' '}
          ·{' '}
          <Link
            component="button"
            type="button"
            variant="bodySmall"
            onClick={() => setLegal('privacy')}
          >
            {t.viewPrivacy}
          </Link>
        </Typography>
      </Box>
      <LegalDialog open={legal} onClose={() => setLegal(null)} />
    </Box>
  )
}

function SignInActions({
  onPreview,
  compact = false,
}: {
  onPreview: () => void
  compact?: boolean
}) {
  const t = useCopy()
  const identity = useIdentity()
  return (
    <Stack spacing={1.5} sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
      {identity.error && !compact && <Alert severity="error">{identity.error}</Alert>}
      {identity.mode === 'local' ? (
        <>
          {/* The closing CTA uses its own label so each action has a unique accessible name. */}
          <Button variant="contained" size="large" onClick={onPreview}>
            {compact ? t.getStarted : t.continuePreview}
          </Button>
          {!compact && (
            <Typography variant="bodySmall" color="text.secondary">
              {t.previewNote}
            </Typography>
          )}
        </>
      ) : identity.status === 'error' ? (
        <Button variant="contained" size="large" onClick={() => location.reload()}>
          {t.retry}
        </Button>
      ) : (
        <Button variant="contained" size="large" onClick={() => void identity.signIn()}>
          {compact ? t.getStarted : t.signIn}
        </Button>
      )}
    </Stack>
  )
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number
  icon: ReactNode
  title: string
  body: string
}) {
  const roles = useTheme().material
  return (
    <Box component="li" sx={{ bgcolor: roles.surface, borderRadius: `${shape.lg}px`, p: 3 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 44,
            height: 44,
            borderRadius: `${shape.md}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: roles.secondaryContainer,
            color: roles.onSecondaryContainer,
          }}
        >
          {icon}
        </Box>
        <Typography variant="labelLarge" color="text.secondary">
          {n}
        </Typography>
      </Stack>
      <Typography component="h3" variant="titleLarge">
        {title}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
        {body}
      </Typography>
    </Box>
  )
}

function Feature({ title, items }: { title: string; items: { icon: ReactNode; text: string }[] }) {
  const roles = useTheme().material
  return (
    <Box>
      <Typography component="h2" variant="headlineSmall" sx={{ mb: 2.5 }}>
        {title}
      </Typography>
      <Stack component="ul" spacing={2} sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {items.map((item) => (
          <Stack
            component="li"
            key={item.text}
            direction="row"
            spacing={2}
            sx={{ alignItems: 'center' }}
          >
            <Box aria-hidden="true" sx={{ color: roles.primary, display: 'flex' }}>
              {item.icon}
            </Box>
            <Typography variant="bodyLarge">{item.text}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}

/** A static illustration of the owner flow (decorative; the real app follows sign-in). */
function PhonePreview() {
  const t = useCopy()
  const roles = useTheme().material
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: { xs: 'none', sm: 'block' },
        justifySelf: 'center',
        width: 300,
        borderRadius: '40px',
        p: 1.5,
        bgcolor: roles.inverseSurface,
        boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
      }}
    >
      <Stack
        spacing={1.5}
        sx={{ bgcolor: roles.surface, borderRadius: '30px', p: 2.5, minHeight: 420 }}
      >
        <Typography variant="titleMedium" translate="no">
          {t.appName}
        </Typography>
        <Box
          sx={{
            alignSelf: 'flex-end',
            maxWidth: '85%',
            bgcolor: roles.surfaceContainerHigh,
            borderRadius: `${shape.xl}px ${shape.xs}px ${shape.xl}px ${shape.xl}px`,
            px: 2,
            py: 1.25,
          }}
        >
          <Typography variant="bodyMedium">{t.previewChat}</Typography>
        </Box>
        <Typography variant="bodyMedium">{t.previewReply}</Typography>
        <Box
          sx={{
            bgcolor: roles.surfaceContainerLow,
            borderRadius: `${shape.lg}px`,
            p: 2,
            mt: 'auto',
          }}
        >
          <Typography variant="labelMedium" color="text.secondary">
            {t.reviewTitle}
          </Typography>
          <Typography variant="bodyLarge" sx={{ mt: 0.5 }}>
            {previewItem(t.previewItem)} · {formatPrice(previewPrice(), regionAt().currency)} /{' '}
            {t.previewUnit}
          </Typography>
          <Typography variant="bodyMedium" color="error">
            {t.previewSoldOutItem} · {t.soldOut}
          </Typography>
          <Box
            sx={{
              mt: 1.5,
              bgcolor: roles.primary,
              color: roles.onPrimary,
              borderRadius: `${shape.full}px`,
              textAlign: 'center',
              py: 1,
            }}
          >
            <Typography variant="labelLarge">{t.confirmSave}</Typography>
          </Box>
        </Box>
      </Stack>
    </Box>
  )
}
