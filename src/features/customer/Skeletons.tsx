import { Box, Skeleton, Stack, useTheme } from '@mui/material'
import { useFrontCopy } from '../frontdoors/strings'

// Reduced motion: the placeholders hold still.
const still = {
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
    '&::after': { animation: 'none' },
  },
}

/** The shop page's shape while it loads: full-bleed photo, name, actions and menu rows. */
export function ShopSkeleton() {
  const roles = useTheme().material
  const t = useFrontCopy()
  return (
    <Box
      component="main"
      role="status"
      aria-label={t.loading}
      aria-busy="true"
      data-testid="shop-skeleton"
      sx={{ maxWidth: 720, mx: 'auto', px: 4, pt: { xs: 0, sm: 'calc(80px + env(safe-area-inset-top))' } }}
    >
      <Skeleton
        variant="rectangular"
        animation="wave"
        sx={{
          ...still,
          width: { xs: 'calc(100% + 32px)', sm: '100%' },
          mx: { xs: -4, sm: 0 },
          height: 'auto',
          aspectRatio: '16/10',
          maxHeight: { xs: 300, sm: 260 },
          borderRadius: { xs: 0, sm: '28px' },
          bgcolor: roles.surfaceContainerHigh,
        }}
      />
      <Stack spacing={2} sx={{ mt: 4 }}>
        <Skeleton animation="wave" width="70%" height={40} sx={still} />
        <Skeleton animation="wave" width="45%" sx={still} />
        <Stack direction="row" spacing={1.5}>
          {[112, 168, 128].map((width) => (
            <Skeleton
              key={width}
              variant="rounded"
              animation="wave"
              width={width}
              height={48}
              sx={{ ...still, borderRadius: 999 }}
            />
          ))}
        </Stack>
        {[0, 1, 2, 3].map((n) => (
          <Skeleton
            key={n}
            variant="rounded"
            animation="wave"
            height={64}
            sx={{ ...still, borderRadius: '16px' }}
          />
        ))}
      </Stack>
    </Box>
  )
}
