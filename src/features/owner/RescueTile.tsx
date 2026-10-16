import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { Clock, Leaf, Minus, Plus, X } from 'lucide-react'
import type { components } from '../../api/generated'
import { shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { countdown, useNow } from '../rescue/holds'
import { ApiError } from '../v1/api'
import { formatPrice, shopCurrency } from '../v1/format'
import { Sheet } from '../v1/Sheet'
import { Supporting, Tile } from '../v1/ShopTiles'
import { useCopy } from '../v1/strings'
import { useWorkspace } from '../v1/workspaceContext'
import { fill, useOwnerCopy } from './copy'
import { defaultUntil, shopNow } from './time'

type Deal = components['schemas']['Deal']
type Suggestions = components['schemas']['Suggestions']
type Row = { name: string; qty: number }
const DISCOUNTS = [20, 30, 50] as const

function useDeals(bid: string) {
  const { api } = useWorkspace()
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    api<Deal[]>(`/businesses/${encodeURIComponent(bid)}/rescue`, { signal: abort.signal })
      .then((list) => setDeals(list))
      .catch(() => {
        if (!abort.signal.aborted) setDeals([])
      })
    return () => abort.abort()
  }, [api, bid, version])
  return { deals, reload: useCallback(() => setVersion((n) => n + 1), []) }
}

/**
 * My shop's Rescue tile: quiet until it matters. Idle it offers "Leftovers?"; with a live deal
 * it shows the countdown and portions left. The sheet holds live deals (end early), the
 * forecast's leftover suggestions and a one-tap send (20/30/50 % off, pickup until).
 */
export function RescueTile() {
  const t = useOwnerCopy()
  const locale = useLocale()
  const theme = useTheme()
  const ws = useWorkspace()
  const shop = ws.active!
  const { deals, reload } = useDeals(shop.id)
  const [open, setOpen] = useState(false)
  const now = useNow(Boolean(deals?.some((d) => d.status === 'live')))
  const live = (deals ?? []).filter((d) => d.status === 'live' && d.ends * 1000 > now)
  const first = live[0]
  const qty = first?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0
  const left = first?.items.reduce((sum, item) => sum + item.qty_left, 0) ?? 0
  return (
    <>
      <Tile
        icon={<Leaf size={20} color={theme.chalk.coral.main} />}
        label={t.rescue}
        value={
          first
            ? fill(t.rescueLive, { time: countdown(first.ends * 1000 - now, locale) })
            : t.rescueIdle
        }
        onClick={() => setOpen(true)}
      >
        <Supporting>{first ? fill(t.rescueLiveHint, { left, qty }) : t.rescueIdleHint}</Supporting>
      </Tile>
      <RescueSheet
        open={open}
        deals={deals ?? []}
        now={now}
        onClose={() => setOpen(false)}
        onChanged={reload}
      />
    </>
  )
}

function RescueSheet({
  open,
  deals,
  now,
  onClose,
  onChanged,
}: {
  open: boolean
  deals: Deal[]
  now: number
  onClose: () => void
  onChanged: () => void
}) {
  const t = useOwnerCopy()
  const ws = useWorkspace()
  const shop = ws.active!
  const tz = shop.fields.timezone ?? 'Asia/Singapore'
  const today = shopNow(tz).date
  const day = (deal: Deal) => shopNow(tz, deal.starts * 1000).date
  const live = deals.filter((d) => d.status === 'live' && d.ends * 1000 > now)
  const earlier = deals.filter((d) => day(d) === today && !live.includes(d))
  // One rescue per item per shop day (also after ending early).
  const used = new Set(
    deals.filter((d) => day(d) === today).flatMap((d) => d.items.map((i) => i.name.toLowerCase())),
  )
  return (
    <Sheet
      open={open}
      onClose={onClose}
      titleId="rescue-sheet-title"
      title={t.rescueTitle}
      keepMounted={false}
    >
      <Stack spacing={5}>
        {live.length > 0 && (
          <Box component="section" aria-labelledby="rescue-live-title">
            <Typography id="rescue-live-title" component="h3" variant="titleSmall" sx={{ mb: 2 }}>
              {t.liveNow}
            </Typography>
            <Stack spacing={2}>
              {live.map((deal) => (
                <LiveDeal key={deal.id} deal={deal} now={now} onEnded={onChanged} />
              ))}
            </Stack>
          </Box>
        )}
        {open && <NewRescue used={used} onSent={onChanged} />}
        {earlier.length > 0 && (
          <Box component="section" aria-labelledby="rescue-earlier-title">
            <Typography
              id="rescue-earlier-title"
              component="h3"
              variant="titleSmall"
              color="text.secondary"
              sx={{ mb: 1 }}
            >
              {t.earlier}
            </Typography>
            {earlier.map((deal) => (
              <Typography key={deal.id} variant="bodyMedium" color="text.secondary">
                {deal.items.map((i) => `${i.qty} × ${i.name}`).join(', ')} ·{' '}
                {fill(t.heldLeft, {
                  held: deal.items.reduce((s, i) => s + i.qty - i.qty_left, 0),
                  left: deal.items.reduce((s, i) => s + i.qty_left, 0),
                })}{' '}
                · {deal.status === 'ended' ? t.ended : t.finished}
              </Typography>
            ))}
          </Box>
        )}
      </Stack>
    </Sheet>
  )
}

function LiveDeal({ deal, now, onEnded }: { deal: Deal; now: number; onEnded: () => void }) {
  const t = useOwnerCopy()
  const v1 = useCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const ws = useWorkspace()
  const [busy, setBusy] = useState(false)
  const held = deal.items.reduce((s, i) => s + i.qty - i.qty_left, 0)
  const left = deal.items.reduce((s, i) => s + i.qty_left, 0)
  async function end() {
    setBusy(true)
    try {
      await ws.api(
        `/businesses/${encodeURIComponent(deal.shop_id)}/rescue/${encodeURIComponent(deal.id)}`,
        { method: 'DELETE' },
      )
      ws.notify(t.ended)
      onEnded()
    } catch {
      ws.notify(v1.actionFailed)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Box
      sx={{
        p: 3,
        borderRadius: `${shape.md}px`,
        bgcolor: roles.surfaceContainer,
        borderInlineStart: `4px solid ${theme.chalk.coral.main}`,
      }}
    >
      {deal.items.map((item) => (
        <Stack key={item.name} direction="row" sx={{ gap: 2, alignItems: 'baseline' }}>
          <Typography variant="bodyLarge" sx={{ flex: 1, minWidth: 0 }}>
            {item.qty} × {item.name}
          </Typography>
          <Typography variant="bodyMedium" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {fill(t.priceLine, {
              was: formatPrice(item.was, deal.currency, locale),
              price: formatPrice(item.price, deal.currency, locale),
            })}
          </Typography>
        </Stack>
      ))}
      <Stack direction="row" sx={{ mt: 2, gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Clock size={16} aria-hidden="true" color={roles.onSurfaceVariant} />
        <Typography variant="bodyMedium" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {fill(t.endsIn, { time: countdown(deal.ends * 1000 - now, locale) })}
        </Typography>
        <Typography variant="bodyMedium" color="text.secondary" sx={{ flex: 1 }}>
          {fill(t.heldLeft, { held, left })}
        </Typography>
        {deal.demo && <Chip size="small" label={t.demo} />}
        <Button size="small" variant="outlined" disabled={busy} onClick={() => void end()}>
          {t.endEarly}
        </Button>
      </Stack>
    </Box>
  )
}

function NewRescue({ used, onSent }: { used: Set<string>; onSent: () => void }) {
  const t = useOwnerCopy()
  const v1 = useCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const coral = theme.chalk.coral
  const ws = useWorkspace()
  const shop = ws.active!
  const tz = shop.fields.timezone ?? 'Asia/Singapore'
  const currency = shopCurrency(shop)
  const [hint, setHint] = useState<Suggestions | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [discount, setDiscount] = useState<20 | 30 | 50>(30)
  const [until, setUntil] = useState(() => defaultUntil(shop.fields, tz))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const usedKey = [...used].join('|')
  useEffect(() => {
    const abort = new AbortController()
    ws.api<Suggestions>(`/businesses/${encodeURIComponent(shop.id)}/rescue/suggestions`, {
      signal: abort.signal,
    })
      .then((found) => {
        setHint(found)
        const fresh = found.items.filter((s) => !usedKey.split('|').includes(s.name.toLowerCase()))
        setRows(fresh.map((s) => ({ name: s.name, qty: Math.max(1, s.quantity) })))
        if (fresh[0]) setDiscount(fresh[0].discount_pct)
        if (found.until) setUntil(found.until)
      })
      .catch(() => {
        if (!abort.signal.aborted) setHint(null)
      })
    return () => abort.abort()
  }, [ws, shop.id, usedKey])
  const product = (name: string) => ws.products.find((p) => p.name === name)
  const choices = ws.products.filter(
    (p) =>
      p.available !== false &&
      !used.has(p.name.toLowerCase()) &&
      !rows.some((r) => r.name === p.name),
  )
  const price = (was: number) => Math.floor((was * (100 - discount) + 50) / 100)
  const setQty = (name: string, qty: number) =>
    setRows((all) => all.map((r) => (r.name === name ? { ...r, qty: Math.max(1, qty) } : r)))

  async function send() {
    setBusy(true)
    setError('')
    const base = `/businesses/${encodeURIComponent(shop.id)}/rescue`
    try {
      const proposal = await ws.api<{ id: string; digest: string }>(base, {
        method: 'POST',
        body: JSON.stringify({
          items: rows,
          discount_pct: discount,
          until,
          pickup_note: note.trim(),
        }),
      })
      // The sheet already shows exactly what is sent: one tap approves the sealed proposal.
      await ws.api(`${base}/${encodeURIComponent(proposal.id)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ digest: proposal.digest }),
      })
      ws.notify(t.sent)
      setRows([])
      setNote('')
      onSent()
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0
      setError(status === 422 ? t.pickTime : status === 409 ? t.changed : v1.actionFailed)
    } finally {
      setBusy(false)
    }
  }

  const noHours = !until && !defaultUntil(shop.fields, tz) && !hint?.until
  return (
    <Box component="section" aria-labelledby="rescue-new-title">
      <Typography id="rescue-new-title" component="h3" variant="titleSmall" sx={{ mb: 1 }}>
        {hint?.items.length ? t.likelyLeft : t.newRescue}
      </Typography>
      {hint && (
        <Typography variant="bodySmall" color="text.secondary" sx={{ mb: 2 }}>
          {hint.items.length ? t.estimateNote : t.noEstimate}
        </Typography>
      )}
      <Stack spacing={1}>
        {rows.map((row) => {
          const was = product(row.name)?.price ?? 0
          return (
            <Stack
              key={row.name}
              direction="row"
              sx={{
                alignItems: 'center',
                gap: 1,
                pl: 3,
                pr: 1,
                py: 1,
                borderRadius: `${shape.md}px`,
                bgcolor: roles.surfaceContainer,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
                  {row.name}
                </Typography>
                <Typography variant="bodySmall" color="text.secondary">
                  {fill(t.priceLine, {
                    was: formatPrice(was, currency, locale),
                    price: formatPrice(price(was), currency, locale),
                  })}
                </Typography>
              </Box>
              <IconButton
                aria-label={fill(t.fewer, { item: row.name })}
                disabled={row.qty <= 1}
                onClick={() => setQty(row.name, row.qty - 1)}
              >
                <Minus size={18} />
              </IconButton>
              <Typography
                aria-label={fill(t.qty, { item: row.name })}
                role="status"
                component="p"
                variant="titleMedium"
                sx={{ minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
              >
                {row.qty}
              </Typography>
              <IconButton
                aria-label={fill(t.more, { item: row.name })}
                disabled={row.qty >= 1000}
                onClick={() => setQty(row.name, row.qty + 1)}
              >
                <Plus size={18} />
              </IconButton>
              <IconButton
                aria-label={fill(t.remove, { item: row.name })}
                onClick={() => setRows((all) => all.filter((r) => r.name !== row.name))}
              >
                <X size={18} />
              </IconButton>
            </Stack>
          )
        })}
      </Stack>
      {choices.length > 0 && (
        <TextField
          select
          label={t.addItem}
          value=""
          onChange={(event) => setRows((all) => [...all, { name: event.target.value, qty: 4 }])}
          fullWidth
          sx={{ mt: 2 }}
        >
          {choices.map((p) => (
            <MenuItem key={p.id ?? p.name} value={p.name}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Typography id="rescue-discount" variant="labelLarge" sx={{ display: 'block', mt: 4, mb: 1 }}>
        {t.discount}
      </Typography>
      <Stack role="group" aria-labelledby="rescue-discount" direction="row" sx={{ gap: 2 }}>
        {DISCOUNTS.map((pct) => (
          <Chip
            key={pct}
            label={fill(t.off, { pct })}
            clickable
            aria-pressed={discount === pct}
            onClick={() => setDiscount(pct)}
            sx={{
              minHeight: 40,
              px: 1,
              ...(discount === pct
                ? { bgcolor: coral.container, color: coral.onContainer, fontWeight: 700 }
                : {}),
            }}
          />
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ mt: 4, gap: 3 }}>
        <TextField
          type="time"
          label={t.until}
          value={until}
          onChange={(event) => setUntil(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 160 }}
        />
        <TextField
          label={t.note}
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 300))}
          fullWidth
        />
      </Stack>
      {noHours && (
        <Alert severity="info" sx={{ mt: 3 }}>
          {t.needHours}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 3 }}>
          {error}
        </Alert>
      )}
      <Button
        variant="contained"
        startIcon={<Leaf size={18} />}
        disabled={busy || rows.length === 0 || !until}
        onClick={() => void send()}
        sx={{ mt: 4 }}
      >
        {t.send}
      </Button>
      <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 2 }}>
        {t.sendHint}
      </Typography>
    </Box>
  )
}
