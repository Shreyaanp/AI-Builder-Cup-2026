import {
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Stack,
  Switch,
  Typography,
  useTheme,
} from '@mui/material'
import {
  Camera,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Share2,
  Store,
  Tag,
} from 'lucide-react'
import { Fragment, useState } from 'react'
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
              <ListItem divider={index < rows.length - 1}>
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
            {ws.products.map((product, index) => {
              const available = product.available !== false
              return (
                <Fragment key={product.id ?? product.name}>
                  <ListItem
                    divider={index < ws.products.length - 1}
                    disablePadding
                    secondaryAction={
                      <Switch
                        edge="end"
                        checked={available}
                        onChange={(_, checked) => void ws.setAvailability(product, checked)}
                        slotProps={{
                          input: { 'aria-label': `${t.available}: ${product.name}` },
                        }}
                      />
                    }
                    sx={{ '& .MuiListItemSecondaryAction-root': { right: 16 } }}
                  >
                    <ListItemButton
                      sx={{ borderRadius: 0, pr: 10 }}
                      aria-label={`${t.editProduct} ${product.name}`}
                      onClick={() => ws.openEditor({ kind: 'product', product })}
                    >
                      <ListItemText
                        primary={product.name}
                        secondary={
                          available
                            ? `${formatPrice(product.price)} / ${product.unit}` +
                              (product.stock == null ? '' : ` · ${t.stock}: ${product.stock}`)
                            : `${t.soldOut} · ${formatPrice(product.price)} / ${product.unit}`
                        }
                        slotProps={{
                          primary: {
                            variant: 'bodyLarge',
                            color: available ? 'text.primary' : 'text.secondary',
                          },
                          secondary: {
                            variant: 'bodyMedium',
                            color: available ? 'text.secondary' : 'error',
                          },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                </Fragment>
              )
            })}
          </List>
        )}
      </Box>
      {!compact && <CustomerPage />}
    </Stack>
  )
}

function CustomerPage() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [busy, setBusy] = useState(false)
  const shop = ws.active
  if (!shop || !ws.shareUrl) return null
  const url = ws.shareUrl
  return (
    <Box
      component="section"
      aria-labelledby="customer-page-title"
      sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px`, p: 3 }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
        <Box aria-hidden="true" sx={{ color: roles.primary, display: 'flex' }}>
          <Globe size={22} />
        </Box>
        <Typography id="customer-page-title" component="h2" variant="titleMedium" sx={{ flex: 1 }}>
          {t.customerPage}
        </Typography>
        <Switch
          checked={shop.public}
          disabled={busy}
          onChange={(_, checked) => {
            setBusy(true)
            ws.setShared(checked)
              .catch(() => ws.notify(t.actionFailed))
              .finally(() => setBusy(false))
          }}
          slotProps={{ input: { 'aria-label': t.pageSwitch } }}
        />
      </Stack>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
        {shop.public ? t.customerPageOn : t.customerPageOff}
      </Typography>
      {shop.public && (
        <>
          <Typography
            variant="bodyMedium"
            sx={{
              mt: 2,
              px: 2,
              py: 1.5,
              borderRadius: `${shape.sm}px`,
              bgcolor: roles.surfaceContainerHighest,
              overflowWrap: 'anywhere',
              fontFamily: 'monospace',
            }}
          >
            {url}
          </Typography>
          <Stack direction="row" sx={{ mt: 2, gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<Share2 size={18} />}
              onClick={() => {
                const data = {
                  title: shop.fields.name,
                  text: t.shareMessage(shop.fields.name),
                  url,
                }
                if (navigator.share) void navigator.share(data).catch(() => undefined)
                else
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => ws.notify(t.linkCopied))
                    .catch(() => ws.notify(t.actionFailed))
              }}
            >
              {t.share}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Copy size={18} />}
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() => ws.notify(t.linkCopied))
                  .catch(() => ws.notify(t.actionFailed))
              }
            >
              {t.copyLink}
            </Button>
            <Button
              startIcon={<ExternalLink size={18} />}
              href={url}
              target="_blank"
              rel="noopener"
            >
              {t.openPage}
            </Button>
          </Stack>
        </>
      )}
    </Box>
  )
}
