import {
  Box,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Camera, Clock, MapPin, Pencil, Phone, Plus, Store, Tag } from 'lucide-react'
import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { formatPrice } from '../format'
import { useCopy } from '../strings'
import { useWorkspace } from '../workspaceContext'
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
  if (!ws.active) return <EmptyShop />
  return (
    <Box component="section" aria-label={t.navShop} sx={{ maxWidth: 760, mx: 'auto', pt: 2 }}>
      <ShopSummary />
    </Box>
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

/** Shop details + catalog. Used as the My shop page and as the Coach supporting pane. */
export function ShopSummary({ compact = false }: { compact?: boolean }) {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop) return null
  const rows: { key: keyof typeof t.fields; icon: ReactNode }[] = [
    { key: 'category', icon: <Tag size={20} /> },
    { key: 'location', icon: <MapPin size={20} /> },
    { key: 'hours', icon: <Clock size={20} /> },
    { key: 'phone', icon: <Phone size={20} /> },
  ]
  return (
    <Stack spacing={compact ? 2 : 4}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component={compact ? 'h2' : 'h1'}
            variant={compact ? 'titleLarge' : 'headlineMedium'}
            sx={{ overflowWrap: 'anywhere' }}
          >
            {shop.fields.name}
          </Typography>
          <Chip
            size="small"
            label={shop.registration === 'draft' ? t.draft : t.verificationPending}
            sx={{ mt: 1, bgcolor: roles.secondaryContainer, color: roles.onSecondaryContainer }}
          />
        </Box>
        {!compact && (
          <Button
            variant="outlined"
            startIcon={<Pencil size={18} />}
            onClick={() => ws.openEditor({ kind: 'business', fields: shop.fields })}
          >
            {t.editDetails}
          </Button>
        )}
      </Stack>

      <Box>
        <Typography component="h2" variant="titleSmall" color="text.secondary" sx={{ mb: 1 }}>
          {t.details}
        </Typography>
        <List
          disablePadding
          sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px` }}
        >
          {rows.map((row, index) => (
            <Fragment key={row.key}>
              {index > 0 && <Divider component="li" variant="inset" />}
              <ListItem>
                <ListItemIcon
                  sx={{ color: roles.onSurfaceVariant, minWidth: 44 }}
                  aria-hidden="true"
                >
                  {row.icon}
                </ListItemIcon>
                <ListItemText
                  primary={t.fields[row.key]}
                  secondary={shop.fields[row.key] || t.notProvided}
                  slotProps={{
                    primary: { variant: 'labelMedium', color: 'text.secondary' },
                    secondary: {
                      variant: 'bodyLarge',
                      color: shop.fields[row.key] ? 'text.primary' : 'text.secondary',
                      sx: { overflowWrap: 'anywhere' },
                    },
                  }}
                />
              </ListItem>
            </Fragment>
          ))}
        </List>
      </Box>

      <Box>
        <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
          <Typography component="h2" variant="titleSmall" color="text.secondary" sx={{ flex: 1 }}>
            {t.products}
          </Typography>
          <Button
            startIcon={<Plus size={18} />}
            onClick={() => ws.openEditor({ kind: 'product', product: null })}
          >
            {t.addProduct}
          </Button>
        </Stack>
        {ws.products.length === 0 ? (
          <Typography variant="bodyMedium" color="text.secondary" sx={{ py: 2 }}>
            {t.productsEmpty}
          </Typography>
        ) : (
          <List
            disablePadding
            sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px` }}
          >
            {ws.products.map((product, index) => (
              <Fragment key={product.id ?? product.name}>
                {index > 0 && <Divider component="li" />}
                <ListItemButton
                  sx={{ borderRadius: 0 }}
                  aria-label={`${t.editProduct} ${product.name}`}
                  onClick={() => ws.openEditor({ kind: 'product', product })}
                >
                  <ListItemText
                    primary={product.name}
                    secondary={product.stock == null ? null : `${t.stock}: ${product.stock}`}
                    slotProps={{
                      primary: { variant: 'bodyLarge' },
                      secondary: { variant: 'bodyMedium' },
                    }}
                  />
                  <Typography variant="titleMedium" sx={{ whiteSpace: 'nowrap', ml: 2 }}>
                    {formatPrice(product.price)}
                    <Typography component="span" variant="bodyMedium" color="text.secondary">
                      {' '}
                      / {product.unit}
                    </Typography>
                  </Typography>
                </ListItemButton>
              </Fragment>
            ))}
          </List>
        )}
      </Box>
    </Stack>
  )
}
