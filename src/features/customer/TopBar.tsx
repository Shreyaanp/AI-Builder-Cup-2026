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
    <Box
      component="header"
      data-scrolled={scrolled || undefined}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        minHeight: 64,
        pt: 'env(safe-area-inset-top, 0px)',
        px: 'max(8px, env(safe-area-inset-left, 0px))',
        bgcolor: roles.surface,
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid transparent',
        transition: 'border-color 200ms var(--c-ease)',
        '&[data-scrolled]': { borderBottomColor: roles.outlineVariant },
        viewTransitionName: 'customer-top-bar',
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
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        {!back && <ProfileButton inline />}
        <LanguagePicker variant="inline" />
        <AppearanceToggle inline />
      </Stack>
    </Box>
  )
}
