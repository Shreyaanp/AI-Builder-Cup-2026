import { useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
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
  ChevronDown,
  Circle,
  Copy,
  ExternalLink,
  MapPinned,
  Pencil,
} from 'lucide-react'
import { formatPrice, shopCurrency } from '../format'
import { Sheet } from '../Sheet'
import { useCopy } from '../strings'
import { useWorkspace } from '../workspaceContext'
import { GoogleSimulator } from '../../google-sim/GoogleSimulator'
import { mapsSearch, OWNER_URL } from '../../google-sim/links'
import { useSimCopy } from '../../google-sim/strings'
import { shape } from '../../../design/theme'

// Owner-reported only: Chalkboard cannot read verification status from Google.
const verifiedKey = (id: string) => `chalkboard.googleVerified.${id}`
function readVerified(id: string) {
  try {
    return localStorage.getItem(verifiedKey(id)) === '1'
  } catch {
    return false
  }
}
function writeVerified(id: string, value: boolean) {
  try {
    if (value) localStorage.setItem(verifiedKey(id), '1')
    else localStorage.removeItem(verifiedKey(id))
  } catch {
    // Storage blocked: the answer lasts for this visit only.
  }
}

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number
  done: boolean
  title: string
  children: ReactNode
}) {
  const roles = useTheme().material
  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        display: 'grid',
        gridTemplateColumns: '32px minmax(0, 1fr)',
        gap: 3,
        p: 4,
        borderRadius: `${shape.lgIncreased}px`,
        bgcolor: roles.surfaceContainerLow,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: done ? roles.primary : roles.surfaceContainerHighest,
          color: done ? roles.onPrimary : roles.onSurfaceVariant,
          typography: 'labelLarge',
        }}
      >
        {done ? <CheckCircle2 size={18} /> : n}
      </Box>
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Typography component="h2" variant="titleMedium">
          {title}
        </Typography>
        {children}
      </Stack>
    </Box>
  )
}

// Official owner entry points (support.google.com/business/answer/2911778).
export function GoogleScreen() {
  const t = useCopy()
  const sim = useSimCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [readiness, setReadiness] = useState(false)
  const [copied, setCopied] = useState(false)
  const [practice, setPractice] = useState(false)
  const [verified, setVerified] = useState<Record<string, boolean>>({})
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
  const isVerified = verified[shop.id] ?? readVerified(shop.id)
  const checks = [
    { label: t.checkName, done: Boolean(f.name.trim()) },
    { label: t.checkCategory, done: Boolean(f.category.trim()) },
    { label: t.checkLocation, done: Boolean(f.location.trim()) },
    { label: t.checkHours, done: Boolean(f.hours.trim()) },
    { label: t.checkPhone, done: Boolean(f.phone.trim()) },
    { label: t.checkProducts, done: ws.products.length > 0 },
  ]
  const done = checks.filter((check) => check.done).length
  const products = ws.products
    .map((p) => `${p.name} ${formatPrice(p.price, shopCurrency(shop))}/${p.unit}`)
    .join(', ')
  const rows = [
    { label: t.fields.name, value: f.name },
    { label: t.fields.category, value: f.category },
    { label: t.fields.location, value: f.location },
    { label: t.fields.hours, value: f.hours },
    { label: t.fields.phone, value: f.phone },
    { label: t.products, value: products },
  ].filter((row) => row.value.trim())
  const listing = rows
    .map((row, i) => (i === 0 ? row.value : `${row.label}: ${row.value}`))
    .join('\n')

  function copy(text: string, all = false) {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        if (all) setCopied(true)
        ws.notify(t.copied)
      })
      .catch(() => ws.notify(t.actionFailed))
  }

  function setOwnerVerified(value: boolean) {
    if (!shop) return
    writeVerified(shop.id, value)
    setVerified((current) => ({ ...current, [shop.id]: value }))
  }

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
        <Alert severity="info">{t.googleHonest}</Alert>

        <Box component="ol" sx={{ m: 0, p: 0, display: 'grid', gap: 3 }}>
          <Step n={1} done={done === checks.length} title={t.stepDetails}>
            <LinearProgress
              variant="determinate"
              value={(done / checks.length) * 100}
              aria-hidden="true"
              sx={{ height: 4, borderRadius: 2, bgcolor: roles.surfaceContainerHighest }}
            />
            <Typography variant="bodyMedium" color="text.secondary">
              {t.readiness(done, checks.length)}
              {done < checks.length &&
                ` · ${checks
                  .filter((check) => !check.done)
                  .map((check) => check.label)
                  .join(' · ')}`}
            </Typography>
            <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
              {done < checks.length && (
                <Button
                  variant="contained"
                  startIcon={<Pencil size={18} />}
                  onClick={() => ws.openEditor({ kind: 'business', fields: shop.fields })}
                >
                  {t.editDetails}
                </Button>
              )}
              <Button onClick={() => setReadiness(true)}>{t.seeChecks}</Button>
            </Stack>
          </Step>

          <Step n={2} done={copied} title={t.stepCopy}>
            <Typography variant="bodyMedium" color="text.secondary">
              {t.stepCopyHint}
            </Typography>
            <Box
              component="div"
              sx={{ m: 0, borderRadius: `${shape.md}px`, bgcolor: roles.surface, px: 3 }}
            >
              {rows.map((row) => (
                <Box
                  key={row.label}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: 2,
                    py: 2,
                    '& + &': { borderTop: `1px solid ${roles.outlineVariant}` },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography component="div" variant="labelMedium" color="text.secondary">
                      {row.label}
                    </Typography>
                    <Typography
                      component="div"
                      variant="bodyMedium"
                      sx={{ m: 0, overflowWrap: 'anywhere' }}
                    >
                      {row.value}
                    </Typography>
                  </Box>
                  <IconButton aria-label={t.copyField(row.label)} onClick={() => copy(row.value)}>
                    <Copy size={18} />
                  </IconButton>
                </Box>
              ))}
            </Box>
            <Button
              variant="outlined"
              startIcon={<Copy size={18} />}
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => copy(listing, true)}
            >
              {t.copyListing}
            </Button>
          </Step>

          <Step n={3} done={isVerified} title={t.stepAdd}>
            <Chip
              size="small"
              label={sim.liveOwner}
              sx={{ alignSelf: 'flex-start', bgcolor: roles.secondaryContainer }}
            />
            <Typography variant="bodyMedium" color="text.secondary">
              {t.stepAddHint}
            </Typography>
            <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<ExternalLink size={18} />}
                href={OWNER_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.addOnGoogle}
              </Button>
              <Button
                variant="outlined"
                startIcon={<MapPinned size={18} />}
                href={mapsSearch(f.name, f.location)}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby="google-maps-live"
              >
                {t.claimOnMaps}
              </Button>
            </Stack>
            <Typography id="google-maps-live" variant="bodySmall" color="text.secondary">
              {sim.liveMaps}
            </Typography>
          </Step>

          <Step n={4} done={isVerified} title={t.stepVerify}>
            <Typography variant="bodyMedium" color="text.secondary">
              {isVerified ? t.verifiedOwner : t.stepVerifyHint}
            </Typography>
            {isVerified ? (
              <Button sx={{ alignSelf: 'flex-start' }} onClick={() => setOwnerVerified(false)}>
                {t.verifiedUndo}
              </Button>
            ) : (
              <Button
                variant="outlined"
                startIcon={<CheckCircle2 size={18} />}
                sx={{ alignSelf: 'flex-start' }}
                onClick={() => setOwnerVerified(true)}
              >
                {t.verifiedYes}
              </Button>
            )}
          </Step>
        </Box>

        <Box>
          <Button
            fullWidth
            aria-expanded={practice}
            aria-controls="google-practice"
            endIcon={
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  transition: 'transform 200ms',
                  transform: practice ? 'rotate(180deg)' : 'none',
                }}
              >
                <ChevronDown size={18} />
              </Box>
            }
            onClick={() => setPractice((open) => !open)}
            sx={{ justifyContent: 'space-between', minHeight: 48 }}
          >
            {t.practiceSteps}
          </Button>
          <Collapse in={practice} unmountOnExit>
            <Box
              id="google-practice"
              sx={{
                mt: 2,
                bgcolor: roles.surfaceContainerLow,
                borderRadius: `${shape.lgIncreased}px`,
                p: 4,
              }}
            >
              <GoogleSimulator />
            </Box>
          </Collapse>
        </Box>
      </Stack>

      <Sheet
        open={readiness}
        onClose={() => setReadiness(false)}
        titleId="google-readiness-title"
        title={t.readiness(done, checks.length)}
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
    </Box>
  )
}
