import type { ReactNode } from 'react'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { customerNavigate } from '../frontdoors/navigation'
import { useAccountCopy } from './copy'

/** Shared tab layout: reserve the app bar, navigation and safe areas on phones. */
export function CollectionPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box
      component="main"
      sx={{
        maxWidth: 720,
        mx: 'auto',
        px: 2,
        pb: 'calc(112px + env(safe-area-inset-bottom, 0px))',
        // CustomerTopBar is 64px plus its 1px border and the top safe area.
        minHeight: { xs: 'calc(100dvh - 65px - env(safe-area-inset-top, 0px))', sm: 0 },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography
        component="h1"
        variant="headlineMedium"
        sx={{ pt: 1, pb: 2, px: 2, fontWeight: 600 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  )
}

/** OB-147: the empty tab's next step belongs above the phone navigation, within reach. */
export function CollectionEmptyState({
  title,
  body,
  icon,
}: {
  title: string
  body: string
  icon?: ReactNode
}) {
  const roles = useTheme().material
  const t = useAccountCopy()
  return (
    <Stack
      className="c-rise"
      sx={{ flex: 1, gap: 2, px: 2, pt: 4, textAlign: 'center', alignItems: 'center' }}
    >
      {icon && (
        <Box
          aria-hidden="true"
          sx={{
            width: 88,
            height: 88,
            borderRadius: '28px',
            display: 'grid',
            placeItems: 'center',
            bgcolor: roles.secondaryContainer,
            color: roles.onSecondaryContainer,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography component="h2" variant="titleLarge">
        {title}
      </Typography>
      <Typography color="text.secondary">{body}</Typography>
      <Box sx={{ mt: { xs: 'auto', sm: 0 }, pt: 2, width: { xs: '100%', sm: 'auto' } }}>
        <Button
          component="a"
          href="/explore/"
          onClick={customerNavigate}
          variant="contained"
          fullWidth
        >
          {t.findShops}
        </Button>
      </Box>
    </Stack>
  )
}
