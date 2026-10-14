import { useState } from 'react'
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
import {
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Gauge,
  Info,
  ListChecks,
  MapPinned,
  Pencil,
} from 'lucide-react'
import { formatPrice, shopCurrency } from '../format'
import { Sheet } from '../Sheet'
import { Supporting, Tile } from '../ShopTiles'
import { useCopy } from '../strings'
import { useWorkspace } from '../workspaceContext'
import { GoogleSimulator } from '../../google-sim/GoogleSimulator'
import { mapsSearch, OWNER_URL } from '../../google-sim/links'
import { useSimCopy } from '../../google-sim/strings'
import { shape } from '../../../design/theme'

// Official owner entry points (support.google.com/business/answer/2911778).
export function GoogleScreen() {
  const t = useCopy()
  const sim = useSimCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [sheet, setSheet] = useState<'readiness' | 'steps' | null>(null)
  const shop = ws.active
  if (!shop)
    return (
      <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', pt: 8 }}>
        <Typography component="h1" variant="headlineMedium">
          {t.googleTitle}
        </Typography>
        <Alert severity="info">{t.googleNeedsShop}</Alert>
        <Button
          variant="contained"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => ws.openEditor({ kind: 'business', fields: null })}
        >
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
        ws.products
          .map((p) => `${p.name} ${formatPrice(p.price, shopCurrency(ws.active))}/${p.unit}`)
          .join(', '),
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
          <Typography variant="bodyLarge" color="text.secondary" sx={{ mt: 2 }}>
            {t.googleBody}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 3 }}>
          <Tile
            wide
            icon={<Gauge size={20} />}
            label={t.readinessTitle}
            value={t.readiness(done, checks.length)}
            onClick={() => setSheet('readiness')}
          >
            <LinearProgress
              variant="determinate"
              value={(done / checks.length) * 100}
              aria-hidden="true"
              sx={{ height: 4, borderRadius: 2, bgcolor: roles.surfaceContainerHighest }}
            />
            <Supporting>
              {checks
                .filter((check) => !check.done)
                .map((check) => check.label)
                .join(' · ') || t.ready}
            </Supporting>
          </Tile>
          <Tile
            wide
            icon={<ListChecks size={20} />}
            label={t.finishOnGoogle}
            value={t.googleSteps[0]}
            onClick={() => setSheet('steps')}
          >
            <Supporting>{sim.liveOwner}</Supporting>
          </Tile>
        </Box>

        <Stack
          direction="row"
          spacing={3}
          sx={{ alignItems: 'flex-start', color: 'text.secondary' }}
        >
          <Box aria-hidden="true" sx={{ pt: 0.5, display: 'flex' }}>
            <Info size={18} />
          </Box>
          <Typography variant="bodyMedium">{t.googleHonest}</Typography>
        </Stack>
        {/* The simulator stays on the page (restyle only): its Simulated flag is always visible. */}
        <Box
          sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lgIncreased}px`, p: 4 }}
        >
          <GoogleSimulator />
        </Box>
      </Stack>

      <Sheet
        open={sheet === 'readiness'}
        onClose={() => setSheet(null)}
        titleId="google-readiness-title"
        title={t.readiness(done, checks.length)}
        actions={
          done < checks.length ? (
            <Button
              variant="contained"
              startIcon={<Pencil size={18} />}
              onClick={() => {
                setSheet(null)
                ws.openEditor({ kind: 'business', fields: shop.fields })
              }}
            >
              {t.editDetails}
            </Button>
          ) : undefined
        }
      >
        <List dense disablePadding>
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
      </Sheet>

      <Sheet
        open={sheet === 'steps'}
        onClose={() => setSheet(null)}
        titleId="google-steps-title"
        title={t.finishOnGoogle}
      >
        <Stack spacing={4}>
          <Box component="ol" sx={{ m: 0, pl: 6, display: 'grid', gap: 2 }}>
            {t.googleSteps.map((step) => (
              <Typography component="li" variant="bodyLarge" key={step}>
                {step}
              </Typography>
            ))}
          </Box>
          <Typography variant="bodyMedium" color="text.secondary">
            {sim.handoffHelp}
          </Typography>
          <Stack spacing={2}>
            <Typography variant="labelMedium">{sim.liveOwner}</Typography>
            <Button
              variant="contained"
              startIcon={<ExternalLink size={20} />}
              href={OWNER_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.addOnGoogle}
            </Button>
          </Stack>
          <Stack spacing={2}>
            <Typography variant="labelMedium">{sim.liveMaps}</Typography>
            <Button
              variant="outlined"
              startIcon={<MapPinned size={20} />}
              href={mapsSearch(f.name, f.location)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.claimOnMaps}
            </Button>
          </Stack>
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
      </Sheet>
    </Box>
  )
}
