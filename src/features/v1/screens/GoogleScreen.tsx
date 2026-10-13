import {
  Alert,
  Box,
  Button,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { CheckCircle2, Circle, Copy, ExternalLink, Info, MapPinned } from 'lucide-react'
import { formatPrice } from '../format'
import { useCopy } from '../strings'
import { useWorkspace } from '../workspaceContext'
import { shape } from '../../../design/theme'

// Official owner entry points (support.google.com/business/answer/2911778).
const ADD_URL = 'https://business.google.com/add'
const mapsSearch = (query: string) =>
  'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query)

export function GoogleScreen() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const shop = ws.active
  if (!shop)
    return (
      <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', pt: 8 }}>
        <Typography component="h1" variant="headlineMedium">
          {t.googleTitle}
        </Typography>
        <Alert severity="info">{t.googleNeedsShop}</Alert>
        <Button variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={() => ws.go('shop')}>
          {t.addShop}
        </Button>
      </Stack>
    )
  const f = shop.fields
  const checks = [
    { label: t.checkName, done: Boolean(f.name.trim()) },
    { label: t.checkCategory, done: Boolean(f.category.trim()) },
    { label: t.checkLocation, done: Boolean(f.location.trim()) },
    { label: t.checkHours, done: Boolean(f.hours.trim()) },
    { label: t.checkPhone, done: Boolean(f.phone.trim()) },
    { label: t.checkProducts, done: ws.products.length > 0 },
  ]
  const done = checks.filter((check) => check.done).length
  const listing = [
    f.name,
    f.category && `${t.fields.category}: ${f.category}`,
    f.location && `${t.fields.location}: ${f.location}`,
    f.hours && `${t.fields.hours}: ${f.hours}`,
    f.phone && `${t.fields.phone}: ${f.phone}`,
    ws.products.length > 0 &&
      `${t.products}: ` +
        ws.products.map((p) => `${p.name} ${formatPrice(p.price)}/${p.unit}`).join(', '),
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <Box component="section" aria-label={t.navGoogle} sx={{ maxWidth: 760, mx: 'auto', pt: 2 }}>
      <Stack spacing={4}>
        <Box>
          <Typography component="h1" variant="headlineMedium">
            {t.googleTitle}
          </Typography>
          <Typography variant="bodyLarge" color="text.secondary" sx={{ mt: 1 }}>
            {t.googleBody}
          </Typography>
        </Box>

        <Box sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px`, p: 3 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5 }}
          >
            <Typography component="h2" variant="titleMedium">
              {shop.fields.name}
            </Typography>
            <Typography variant="labelLarge" color="text.secondary">
              {t.readiness(done, checks.length)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={(done / checks.length) * 100}
            aria-label={t.readiness(done, checks.length)}
            sx={{ height: 6, borderRadius: 3, bgcolor: roles.surfaceContainerHighest }}
          />
          <List dense sx={{ mt: 1 }}>
            {checks.map((check) => (
              <ListItem key={check.label} disableGutters>
                <ListItemIcon
                  sx={{ minWidth: 40, color: check.done ? roles.primary : roles.outline }}
                  aria-hidden="true"
                >
                  {check.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </ListItemIcon>
                <ListItemText
                  primary={check.label}
                  secondary={check.done ? t.ready : t.missing}
                  slotProps={{
                    primary: { variant: 'bodyLarge' },
                    secondary: { variant: 'bodySmall' },
                  }}
                />
              </ListItem>
            ))}
          </List>
          {done < checks.length && (
            <Button onClick={() => ws.openEditor({ kind: 'business', fields: shop.fields })}>
              {t.editDetails}
            </Button>
          )}
        </Box>

        <Box component="ol" sx={{ m: 0, pl: 3, display: 'grid', gap: 1.5 }}>
          {t.googleSteps.map((step) => (
            <Typography component="li" variant="bodyLarge" key={step}>
              {step}
            </Typography>
          ))}
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button
            variant="contained"
            startIcon={<ExternalLink size={20} />}
            href={ADD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.addOnGoogle}
          </Button>
          <Button
            variant="outlined"
            startIcon={<MapPinned size={20} />}
            href={mapsSearch([f.name, f.location].filter(Boolean).join(' '))}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.claimOnMaps}
          </Button>
          <Button
            startIcon={<Copy size={20} />}
            onClick={() => {
              void navigator.clipboard
                .writeText(listing)
                .then(() => ws.notify(t.copied))
                .catch(() => ws.notify(t.actionFailed))
            }}
          >
            {t.copyListing}
          </Button>
        </Stack>

        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'flex-start', color: 'text.secondary' }}
        >
          <Box aria-hidden="true" sx={{ pt: 0.25 }}>
            <Info size={18} />
          </Box>
          <Typography variant="bodyMedium">{t.googleHonest}</Typography>
        </Stack>
      </Stack>
    </Box>
  )
}
