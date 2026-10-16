import { Box, Button, Skeleton, Stack, Typography, useTheme } from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { Store } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCopy } from '../strings'
import { useTabsCopy } from '../tabsCopy'
import { useNewShopCopy } from '../newShopCopy'
import { LoadError } from '../LoadError'
import { useWorkspace } from '../workspaceContext'
import { ShopOverview } from '../ShopTiles'
import { shape } from '../../../design/theme'

export function ShopScreen() {
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  return (
    <ShopGate>
      <Box component="section" aria-label={tabs.navShop} sx={{ maxWidth: 760, mx: 'auto', pt: 2 }}>
        <ShopHome key={ws.activeId} />
      </Box>
    </ShopGate>
  )
}

/** Shop and Grow need a shop: loading, load error and "add your shop" come first. */
export function ShopGate({ children }: { children: ReactNode }) {
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
  return children
}

/**
 * Glanceable tiles; the detail lives in bottom sheets, not a long page. The top bar already
 * names the shop, so the customer page card starts at the top.
 */
function ShopHome() {
  const tabs = useTabsCopy()
  return (
    <>
      <Typography component="h1" sx={visuallyHidden}>
        {tabs.navShop}
      </Typography>
      <ShopOverview />
    </>
  )
}
function EmptyShop() {
  const t = useCopy()
  const ws = useWorkspace()
  const flow = useNewShopCopy()
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
        {flow.heroBody}
      </Typography>
      {/* One way in: the full-screen new-shop flow (it asks for the menu photo itself). */}
      <Button
        variant="contained"
        size="large"
        startIcon={<Store size={20} />}
        onClick={ws.startNewShop}
        sx={{ width: { xs: '100%', sm: 'auto' } }}
      >
        {flow.createShop}
      </Button>
    </Stack>
  )
}
