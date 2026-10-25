import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { BarChart3, X } from 'lucide-react'
import { useIdentity } from '../../auth/useIdentity'
import { readDismissal, dismissFreshness, subscribeDismissal } from './freshnessDismissal'
import type { components } from '../../api/generated'
import { formatLocale, type Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'
import { shape } from '../../design/theme'
import { Sheet } from '../v1/Sheet'
import { Tile, Supporting } from '../v1/ShopTiles'
import { formatShopPrice } from '../v1/format'
import { useCopy } from '../v1/strings'
import { useWorkspace } from '../v1/workspaceContext'

interface Freshness {
  today: string
  monday: boolean
  recap_week?: string
  last_confirmed: string | null
}
type Recap = components['schemas']['Recap']

/** ISO weeks are Monday–Sunday; UTC keeps date-only boundaries stable on every device. */
function weekRange(week: string, locale: Locale) {
  const year = Number(week.slice(0, 4))
  const january4 = new Date(Date.UTC(year, 0, 4))
  const monday = new Date(january4)
  monday.setUTCDate(4 - ((january4.getUTCDay() + 6) % 7) + (Number(week.slice(-2)) - 1) * 7)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return new Intl.DateTimeFormat(formatLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: monday.getUTCFullYear() !== sunday.getUTCFullYear() ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).formatRange(monday, sunday)
}

function useFreshness() {
  const { api, active } = useWorkspace()
  const [value, setValue] = useState<Freshness | null>(null)
  const [error, setError] = useState(false)
  const [attempt, retry] = useState(0)
  const id = active?.id
  const confirmed = active?.last_confirmed
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const load = () => {
      void api<Freshness>(`/businesses/${id}/freshness`, { signal: controller.signal })
        .then((next) => {
          if (!controller.signal.aborted) {
            setValue(next)
            setError(false)
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true)
        })
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [api, id, confirmed, attempt])
  return { value, error, retry: () => retry((n) => n + 1) }
}

export function FreshnessCard({ compact = false }: { compact?: boolean }) {
  const ws = useWorkspace()
  const t = useCopy()
  const roles = useTheme().material
  const { value, error, retry } = useFreshness()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const { scope } = useIdentity()
  const dismissalKey = `chalkboard.freshness.${scope}.${ws.active?.id ?? ''}`
  const dismissed = useSyncExternalStore(
    subscribeDismissal,
    () => readDismissal(dismissalKey),
    () => null,
  )
  if (!ws.active) return null
  if (error)
    return (
      <Alert severity="error" action={<Button onClick={retry}>{t.retry}</Button>}>
        {t.actionFailed}
      </Alert>
    )
  if (!value || value.last_confirmed === value.today || dismissed === value.today) return null
  async function confirm() {
    if (!ws.active || busy) return
    setBusy(true)
    setFailed(false)
    try {
      await ws.api(`/businesses/${ws.active.id}/freshness/confirm`, { method: 'POST' })
      await ws.reload()
      retry()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack
      spacing={compact ? 0 : 2}
      sx={{
        p: compact ? 2 : 3,
        borderRadius: `${shape.lg}px`,
        bgcolor: roles.surfaceContainer,
        color: roles.onSurface,
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography
          component="h2"
          variant={compact ? 'bodyMedium' : 'titleMedium'}
          sx={{ flex: 1 }}
        >
          {t.freshnessTitle}
        </Typography>
        <IconButton
          aria-label={t.dismiss}
          onClick={() => dismissFreshness(dismissalKey, value.today)}
          sx={{ width: 48, height: 48 }}
        >
          <X size={18} />
        </IconButton>
      </Stack>
      {failed && <Alert severity="error">{t.actionFailed}</Alert>}
      <Stack
        direction={compact ? 'row' : { xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ flexWrap: 'wrap' }}
      >
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void confirm()}
          startIcon={busy ? <CircularProgress size={18} /> : undefined}
          sx={{ minHeight: 48 }}
        >
          {t.freshnessYes}
        </Button>
        <Button
          disabled={busy}
          onClick={() => ws.startCoachDraft(t.todayDraft)}
          sx={{ minHeight: 48 }}
        >
          {t.freshnessChanged}
        </Button>
      </Stack>
    </Stack>
  )
}

/** Monday placement is a rule in shop time; the recap itself is only fetched on opening. */
export function RecapTile({ mondayOnly = false }: { mondayOnly?: boolean }) {
  const t = useCopy()
  const locale = useLocale()
  const { value } = useFreshness()
  const [open, setOpen] = useState(false)
  if (!value?.recap_week || (mondayOnly && !value.monday)) return null
  return (
    <>
      <Tile
        wide
        icon={<BarChart3 size={20} />}
        label={t.recapTitle}
        value={weekRange(value.recap_week, locale)}
        onClick={() => setOpen(true)}
      >
        <Supporting>{t.recapHint}</Supporting>
      </Tile>
      <Sheet open={open} onClose={() => setOpen(false)} titleId="recap-title" title={t.recapTitle}>
        {open && <RecapDetails week={value.recap_week} />}
      </Sheet>
    </>
  )
}

function RecapDetails({ week }: { week: string }) {
  const { api, activeId } = useWorkspace()
  const locale = useLocale()
  const t = useCopy()
  const [recap, setRecap] = useState<Recap | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, retry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void api<Recap>(`/businesses/${activeId}/recap?week=${week}&language=${locale}`, {
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setRecap(next)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [api, activeId, week, locale, attempt])
  if (failed)
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => retry((n) => n + 1)}>{t.retry}</Button>}
      >
        {t.actionFailed}
      </Alert>
    )
  if (!recap) return <CircularProgress aria-label={t.loading} />
  return (
    <Stack spacing={recap.sales_days ? 3 : 2}>
      <Typography component="p" variant="titleMedium">
        {weekRange(week, locale)}
      </Typography>
      {!recap.sales_days && <Alert severity="info">{t.recapEmpty}</Alert>}
      {recap.sales_days > 0 && (
        <>
          <Typography variant="bodyMedium">
            {t.recapCoverage(recap.sales_days, recap.previous_sales_days)}
          </Typography>
          <Box>
            <Chip size="small" label={recap.mode === 'gemini' ? t.writtenByAi : t.offlineRecap} />
            <Typography variant="bodyLarge" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
              {recap.summary}
            </Typography>
          </Box>
        </>
      )}
      {recap.sales_days > 0 && (
        <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>
          <Typography component="h3" variant="titleSmall">
            {t.revenue}
          </Typography>
          <Typography variant="headlineSmall">
            {formatShopPrice(recap.revenue, recap.currency)}
          </Typography>
          <Typography variant="bodyMedium">
            {t.recapPrevious}:{' '}
            {recap.previous_sales_days
              ? formatShopPrice(recap.previous_revenue, recap.currency)
              : '–'}
          </Typography>
          {recap.previous_sales_days > 0 && (
            <Typography variant="bodyMedium">
              {formatShopPrice(recap.revenue_change, recap.currency)}{' '}
              {recap.revenue_change_percent !== null ? `(${recap.revenue_change_percent}%)` : ''}
            </Typography>
          )}
        </Box>
      )}
      {(
        [
          [t.topItems, recap.top_sellers],
          [t.slowMovers, recap.slow_movers],
        ] as const
      )
        .filter(([, items]) => recap.sales_days > 0 && items.length > 0)
        .map(([label, items]) => (
          <Box key={label}>
            <Typography component="h3" variant="titleSmall">
              {label}
            </Typography>
            <List disablePadding>
              {items.map((item) => (
                <ListItem key={item.item} disableGutters divider>
                  <ListItemText
                    primary={item.item}
                    secondary={`${item.quantity} · ${formatShopPrice(item.revenue, recap.currency)}`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      <Typography variant="bodyMedium">
        {t.soldOutEvents}: {recap.sold_out_count}
      </Typography>
      <Typography variant="bodyMedium">
        {t.customerQuestionCount}: {recap.customer_questions_count}
      </Typography>
    </Stack>
  )
}
