import { useEffect, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { useWorkspace } from '../v1/workspaceContext'
import { shape } from '../../design/theme'
import { useCopy } from './strings'
import { useCopy as useShopCopy } from '../v1/strings'
import { useShopCopy as useUnitCopy } from '../shop/strings'
import { unitLabel } from '../shop/units'

interface Observation {
  date: string
  status: 'complete' | 'closed' | 'missing' | 'stockout'
  sold: number | null
  source: 'demo' | 'owner'
}
interface Forecast {
  status: string
  source?: 'demo' | 'owner' | 'sales'
  baseline?: number
  planning_baseline?: number
  suggestion?: number
  gap?: number
  unit: string
  forecast_date: string
  window: string[]
  n: number
  range_seen?: number[]
  evaluation: { n: number; mae: number | null; naive_mae: number | null; prefer_naive: boolean }
}
interface Plan {
  created_date: string
  decision: 'accepted' | 'edited' | 'declined'
  quantity: number
  source: 'demo' | 'owner'
  ready_stock: number
  capacity: number
  forecast: Forecast
  stale?: boolean
}
interface History {
  today?: string
  observations?: Observation[]
  plan?: Plan
  pending?: { digest: string; snapshot: { observations?: Observation[]; plan?: Plan } }
}

export function PlanTomorrow() {
  const ws = useWorkspace()
  const t = useCopy()
  const units = useUnitCopy()
  const [selected, setSelected] = useState('')
  const product = ws.products.find((p) => p.id === selected) ?? ws.products[0]
  if (!ws.active || !product?.id) return null
  return (
    <Stack spacing={2}>
      <TextField
        select
        label={t.product}
        value={product.id}
        onChange={(e) => setSelected(e.target.value)}
      >
        {ws.products.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name} ({unitLabel(p.unit, units)})
          </MenuItem>
        ))}
      </TextField>
      <PlanningCard
        key={`${ws.active.id}/${product.id}`}
        businessId={ws.active.id}
        productId={product.id}
        name={product.name}
        unit={unitLabel(product.unit, units)}
      />
    </Stack>
  )
}

function PlanningCard({
  businessId,
  productId,
  name,
  unit,
}: {
  businessId: string
  productId: string
  name: string
  unit: string
}) {
  const { api } = useWorkspace()
  const t = useCopy()
  const shopCopy = useShopCopy()
  const roles = useTheme().material
  const [source, setSource] = useState<'owner' | 'demo'>('owner')
  const [ready, setReady] = useState('0')
  const [capacity, setCapacity] = useState('0')
  const [sold, setSold] = useState('')
  const [quantity, setQuantity] = useState('')
  const [history, setHistory] = useState<History>({})
  const [result, setResult] = useState<Forecast | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(false)
  const path = `/businesses/${businessId}/planning/${productId}`
  useEffect(() => {
    const controller = new AbortController()
    api<History>(path, { signal: controller.signal })
      .then(setHistory)
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    return () => controller.abort()
  }, [api, path])
  const valid = (s: string) => /^\d+$/.test(s) && Number(s) <= 1000000
  const inputs = { source, ready_stock: Number(ready), capacity: Number(capacity) }
  async function run(action: string, body: unknown = {}) {
    setBusy(true)
    setError(false)
    try {
      if (action === '/forecast') {
        const next = await api<Forecast>(path + action, {
          method: 'POST',
          body: JSON.stringify(body),
        })
        setResult(next)
        setQuantity(String(next.suggestion ?? ''))
      } else {
        const next = await api<History>(path + action, {
          method: action ? 'POST' : 'GET',
          body: action ? JSON.stringify(body) : undefined,
        })
        setHistory(next)
        if (action === '/approve') setResult(null)
      }
    } catch {
      setResult(null)
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  const pending = history.pending
  return (
    <Box
      component="section"
      aria-label={t.title}
      aria-busy={busy}
      sx={{
        bgcolor: roles.surfaceContainerLow,
        color: roles.onSurface,
        borderRadius: `${shape.lg}px`,
        p: 3,
        '& .MuiButton-root': { minHeight: 48 },
      }}
    >
      <Stack spacing={2}>
        <Typography id="plan-title" component="h2" variant="titleLarge">
          {t.title}
        </Typography>
        <Typography variant="bodyMedium">
          {name} / {unit}
        </Typography>
        <Typography variant="bodyMedium">{t.private}</Typography>
        {error && (
          <Alert severity="error">
            {t.error}
            <Button disabled={busy} onClick={() => void run('')}>
              {t.retry}
            </Button>
          </Alert>
        )}
        <TextField
          select
          disabled={busy}
          label={t.source}
          value={source}
          onChange={(e) => {
            setSource(e.target.value as 'owner' | 'demo')
            setResult(null)
          }}
        >
          <MenuItem value="owner">{t.owner}</MenuItem>
          <MenuItem value="demo">{t.demo}</MenuItem>
        </TextField>
        {source === 'demo' && (
          <>
            <Chip
              label={t.demo}
              sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 1 } }}
            />
            <Button disabled={busy} onClick={() => void run('/demo')}>
              {t.load}
            </Button>
          </>
        )}
        {source === 'owner' && (
          <>
            <TextField
              label={t.sold}
              value={sold}
              onChange={(e) => setSold(e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            />
            <Button
              disabled={busy || !history.today || !valid(sold)}
              onClick={() =>
                void run('/observations', {
                  date: history.today,
                  status: 'complete',
                  sold: Number(sold),
                  source: 'owner',
                })
              }
            >
              {t.record}
            </Button>
          </>
        )}
        <TextField
          disabled={busy}
          label={`${t.ready} (${unit})`}
          value={ready}
          onChange={(e) => {
            setReady(e.target.value)
            setResult(null)
          }}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <TextField
          disabled={busy}
          label={`${t.capacity} (${unit})`}
          value={capacity}
          onChange={(e) => {
            setCapacity(e.target.value)
            setResult(null)
          }}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <Button
          variant="contained"
          disabled={busy || !valid(ready) || !valid(capacity)}
          onClick={() => void run('/forecast', inputs)}
        >
          {t.calculate}
        </Button>
        {result && (
          <Stack spacing={1} role="status">
            {result.status !== 'ready' ? (
              <Typography>{t.insufficient}</Typography>
            ) : (
              <>
                <Typography variant="bodyLarge">
                  {t.baseline}: {result.baseline} {unit}
                </Typography>
                <Typography>
                  {t.additional}: {result.suggestion} {unit}. {t.gap}: {result.gap} {unit}.
                </Typography>
                {result.evaluation.prefer_naive && <Alert severity="warning">{t.naive}</Alert>}
                <Typography>
                  {t.date}: {result.forecast_date}
                </Typography>
                <Typography>
                  {t.range}: {result.range_seen?.join(' - ')} {unit}
                </Typography>
                <TextField
                  label={`${t.quantity} (${unit})`}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
                <Button
                  disabled={busy || !valid(quantity) || Number(quantity) > Number(capacity)}
                  onClick={() =>
                    void run('/decision', {
                      ...inputs,
                      quantity: Number(quantity),
                      decision: Number(quantity) === result.suggestion ? 'accepted' : 'edited',
                    })
                  }
                >
                  {t.accept}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run('/decision', { ...inputs, quantity: 0, decision: 'declined' })
                  }
                >
                  {t.decline}
                </Button>
              </>
            )}
          </Stack>
        )}
        <Accordion disableGutters elevation={0}>
          <AccordionSummary>{t.details}</AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              <Typography variant="bodyMedium">
                {result?.source === 'sales'
                  ? `${shopCopy.fromSales}. ${shopCopy.salesMethod}`
                  : t.method}{' '}
                {t.limited} {t.events}
              </Typography>
              {result && (
                <>
                  <Typography>
                    {t.window}: {result.window.join(', ')} ({result.n})
                  </Typography>
                  <Typography>{t.version}</Typography>
                  <Typography>
                    {result.evaluation.n
                      ? `${t.evaluation}: ${result.evaluation.mae} / ${result.evaluation.naive_mae}`
                      : t.none}
                  </Typography>
                </>
              )}
              {history.observations
                ?.filter((r) => r.source === source)
                .map((r) => (
                  <Typography key={r.date}>
                    {r.date}: {t.status[r.status]} {r.sold ?? ''} {r.sold === null ? '' : unit}
                  </Typography>
                ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
        {pending && (
          <Stack spacing={1}>
            <Typography component="h3" variant="titleMedium">
              {t.review}
            </Typography>
            {pending.snapshot.observations?.map((r) => (
              <Typography key={r.date}>
                {r.source === 'demo' ? t.demo : t.owner} / {r.date} / {t.status[r.status]} /{' '}
                {r.sold ?? ''} {r.sold === null ? '' : unit}
              </Typography>
            ))}
            {pending.snapshot.plan && (
              <Stack spacing={1}>
                <Typography>
                  {t.date}: {pending.snapshot.plan.forecast.forecast_date}
                </Typography>
                <Typography>
                  {t.ready}: {pending.snapshot.plan.ready_stock} {unit} / {t.capacity}:{' '}
                  {pending.snapshot.plan.capacity} {unit}
                </Typography>
                <Typography>
                  {t.baseline}: {pending.snapshot.plan.forecast.baseline} {unit} / {t.gap}:{' '}
                  {pending.snapshot.plan.forecast.gap} {unit}
                </Typography>
                <Typography>
                  {t.decisions[pending.snapshot.plan.decision]} / {pending.snapshot.plan.quantity}{' '}
                  {unit} / {pending.snapshot.plan.source === 'demo' ? t.demo : t.owner}
                </Typography>
              </Stack>
            )}
            <Button
              disabled={busy}
              variant="outlined"
              onClick={() => void run('/approve', { digest: pending.digest })}
            >
              {t.confirm}
            </Button>
            <Button disabled={busy} onClick={() => setHistory({ ...history, pending: undefined })}>
              {t.cancel}
            </Button>
          </Stack>
        )}
        {history.plan && (
          <Typography role="status">
            {history.plan.stale ? t.stale : t.saved}: {t.decisions[history.plan.decision]} /{' '}
            {history.plan.quantity} {unit} / {history.plan.created_date} /{' '}
            {history.plan.source === 'demo' ? t.demo : t.owner}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
