import { Box, Button, Chip, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import { Camera, Store } from 'lucide-react'
import { useCopy } from '../strings'
import { LoadError } from '../LoadError'
import { useWorkspace } from '../workspaceContext'
import { ShopOverview } from '../ShopTiles'
import { shape } from '../../../design/theme'

export function ShopScreen() {
  const t = useCopy()
  const ws = useWorkspace()
  if (ws.loading)
    return (
      <Stack spacing={2} sx={{ maxWidth: 760, mx: 'auto', pt: 4 }} aria-busy="true">
        <Skeleton variant="text" width="60%" height={48} />
        <Skeleton variant="rounded" height={220} />
      </Stack>
    )
  if (ws.loadError)
    return (
      <Box sx={{ maxWidth: 760, mx: 'auto', pt: 4 }}>
        <LoadError />
      </Box>
    )
  if (!ws.active) return <EmptyShop />
  return (
    <Box component="section" aria-label={t.navShop} sx={{ maxWidth: 760, mx: 'auto', pt: 2 }}>
      <ShopHome key={ws.active.id} />
    </Box>
  )
}

/** Glanceable tiles; the detail lives in bottom sheets, not a long page. */
function ShopHome() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop) return null
  return (
    <Stack spacing={4}>
      <Box>
        <Typography component="h1" variant="headlineMedium" sx={{ overflowWrap: 'anywhere' }}>
          {shop.fields.name}
        </Typography>
        <Chip
          size="small"
          label={shop.registration === 'draft' ? t.draft : t.verificationPending}
          sx={{ mt: 2, bgcolor: roles.secondaryContainer, color: roles.onSecondaryContainer }}
        />
      </Box>
      <ShopOverview />
    </Stack>
  )
}
function EmptyShop() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  return (
    <Stack
      spacing={3}
      sx={{
        maxWidth: 480,
        mx: 'auto',
        pt: { xs: 8, sm: 12 },
        textAlign: 'center',
        alignItems: 'center',
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 96,
          height: 96,
          borderRadius: `${shape.xl}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: roles.primaryContainer,
          color: roles.onPrimaryContainer,
        }}
      >
        <Store size={44} />
      </Box>
      <Typography component="h1" variant="headlineSmall">
        {t.shopEmptyTitle}
      </Typography>
      <Typography variant="bodyLarge" color="text.secondary">
        {t.shopEmptyBody}
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ width: { xs: '100%', sm: 'auto' } }}
      >
        <Button variant="contained" startIcon={<Camera size={20} />} onClick={ws.requestPhoto}>
          {t.startPhoto}
        </Button>
        <Button
          variant="outlined"
          onClick={() => ws.openEditor({ kind: 'business', fields: null })}
        >
          {t.addShop}
        </Button>
      </Stack>
    </Stack>
  )
}
