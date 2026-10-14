import { Box, Typography, useTheme } from '@mui/material'
import { useFrontCopy } from './strings'

/** No timer: this fallback lives exactly as long as the pending shell/data. */
export function BrandSplash({ business = false }: { business?: boolean }) {
  const roles = useTheme().material
  const t = useFrontCopy()
  return (
    <Box
      role="status"
      data-testid="brand-splash"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeContent: 'center',
        justifyItems: 'center',
        gap: 3,
        bgcolor: roles.surface,
        color: roles.onSurface,
        '@keyframes chalkMark': {
          from: { transform: 'scale(.8) rotate(-8deg)', opacity: 0 },
          to: { transform: 'none', opacity: 1 },
        },
      }}
    >
      <Box
        component="img"
        src={business ? '/icons/business.svg' : '/icons/customer.svg'}
        width={80}
        height={80}
        alt=""
        sx={{
          animation: 'chalkMark 800ms ease-out both',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
      <Typography variant="titleLarge" translate="no">
        {business ? 'Chalkboard Business' : 'Chalkboard'}
      </Typography>
      <Typography variant="bodyMedium">{t.loading}</Typography>
    </Box>
  )
}
