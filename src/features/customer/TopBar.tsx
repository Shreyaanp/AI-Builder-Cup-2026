import { AppHeader } from '../../design/AppHeader'
import { useEffect, useState } from 'react'
import { Box, Button, Stack, useTheme } from '@mui/material'
import { ArrowLeft } from 'lucide-react'
import { BrandLogo } from '../../design/BrandLogo'
import { AppearanceToggle } from '../frontdoors/AppearanceToggle'
import { LanguagePicker } from '../frontdoors/LanguagePicker'
import { customerBack } from '../frontdoors/navigation'
import { useDemoCopy, useFrontCopy } from '../frontdoors/strings'
import { ProfileButton } from './Profile'

/**
 * The customer pages' one app bar: in the page flow and sticky, so the profile, language and
 * appearance buttons never float over a title (#101). It gains a hairline once the page scrolls
 * under it. `back` adds a Back link on the left (the full list); tab pages show the profile.
 */
export function CustomerTopBar({ back = false }: { back?: boolean }) {
  const roles = useTheme().material
  const t = useFrontCopy()
  const demo = useDemoCopy()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  return (
    <AppHeader
      data-scrolled={scrolled || undefined}
      sx={{
        zIndex: 1100,
        bgcolor: roles.surface,
        backdropFilter: 'blur(12px)',
        '&[data-scrolled]': { boxShadow: `inset 0 -1px ${roles.outlineVariant}` },
        viewTransitionName: 'customer-top-bar',
      }}
    >
      {/* The same 720 px column as the pages below, so the bar lines up with them at 1280 (OB-101). */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          maxWidth: 688,
          width: '100%',
          mx: 'auto',
        }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}>
          <BrandLogo wordmark="wide" href="/explore/" />
          {back ? (
            <Button
              component="a"
              href="/explore/"
              onClick={customerBack}
              startIcon={<ArrowLeft size={18} />}
              sx={{ minHeight: 48 }}
            >
              {t.back}
            </Button>
          ) : (
            <Button href="/explore/demo" sx={{ minHeight: 48 }}>
              {demo.tryDemo}
            </Button>
          )}
        </Stack>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {!back && <ProfileButton inline />}
          <LanguagePicker variant="inline" />
          <AppearanceToggle inline />
        </Stack>
      </Box>
    </AppHeader>
  )
}
