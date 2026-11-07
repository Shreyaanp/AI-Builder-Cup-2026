import { CloseDaySupply } from '../supply/SupplyEntry'
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Camera, Check, ClipboardList, Keyboard, Moon, Plus, Truck, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { productName } from '../../i18n/productNames'
import { useLocale } from '../../state/hooks'
import {
  currencySymbol,
  exponent,
  formatAmount,
  formatShopPrice,
  shopCurrency,
  toMajor,
  toMinor,
} from '../v1/format'
import { useNextStepsCopy } from '../v1/nextStepsCopy'
import { useOnline } from '../v1/useOnline'
import { Tile, Supporting } from '../v1/ShopTiles'
import { useWorkspace } from '../v1/workspaceContext'
import { useIdentity } from '../../auth/useIdentity'
import { dismissFreshness } from '../sales/freshnessDismissal'
import { closeDayCopy, closeDayCount } from './strings'
import { closingMinutes, shopNow } from '../owner/time'
import { moneyLocale, shopZone } from '../../region/region'
import { useDaySales } from './useDaySales'
import { comparisonKind } from './compare'
import { AskHint } from '../v1/AskHint'
import { TomorrowPromise } from './TomorrowPromise'
import { countClosed } from '../v1/today/habitCount'
import { parseCloseDayNumber } from './parseNumber'
import type { components } from '../../api/generated'

type CloseReward = components['schemas']['CloseReward']

export type Kind = 'sales' | 'stock_count' | 'delivery'
type Line = {
  item: string
  read_as: string
  quantity: number | null
  amount: number | null
  matched: boolean
}
type Shot = {
  id: number
  kind: Kind
  url: string
  state: 'reading' | 'done' | 'failed'
  lines: Line[]
  fixture: boolean
  date: string
}
type Sealed = { id: string; digest: string }

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'
const motion = {
  '@keyframes cdRise': {
    from: { opacity: 0, transform: 'translateY(16px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@keyframes cdPop': {
    '0%': { transform: 'scale(0.4)', opacity: 0 },
    '70%': { transform: 'scale(1.12)', opacity: 1 },
    '100%': { transform: 'scale(1)' },
  },
  '@keyframes cdSweep': {
    from: { transform: 'translateY(-100%)' },
    to: { transform: 'translateY(100%)' },
  },
  '@keyframes cdDraw': { to: { strokeDashoffset: 0 } },
}

/** The My shop entry point; it glows a little in the evening, when days are closed. */
export function CloseDayTile() {
  const t = closeDayCopy(useLocale())
  const locale = useLocale()
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  const evening = new Date().getHours() >= 17
  const currency = shopCurrency(ws.active)
  const checked = useDaySales(shopNow(shopZone(ws.active?.fields)).date)
  const closedRows = checked.rows?.length ? checked.rows : null
  return (
    <>
      <Tile
        span={2}
        tour="closeday"
        icon={<Moon size={20} />}
        label={t.title}
        value={
          closedRows
            ? `${t.doneTotal.replace(
                '{sales}',
                formatShopPrice(
                  closedRows.reduce((sum, row) => sum + (row.revenue ?? 0), 0),
                  currency,
                  locale,
                ),
              )} · ${t.edit}`
            : evening
              ? t.tileEvening
              : t.tileValue
        }
        onClick={() => setOpen(true)}
      >
        <Supporting>{t.tileHint}</Supporting>
      </Tile>
      {open && (
        <CloseDay
          onClose={() => {
            setOpen(false)
            checked.refresh()
          }}
        />
      )}
    </>
  )
}

/** `initial`: a photo already chosen elsewhere (the coach chat); it is read as soon as this opens. */
export function CloseDay({
  onClose,
  initial,
}: {
  onClose: () => void
  initial?: { kind: Kind; file: File }
}) {
  const locale = useLocale()
  const t = closeDayCopy(locale)
  const ws = useWorkspace()
  const { scope } = useIdentity()
  const roles = useTheme().material
  const phone = useMediaQuery('(max-width:599px)')
  const shop = ws.active
  const currency = shopCurrency(shop)
  const [shots, setShots] = useState<Shot[]>([])
  const [stage, setPhase] = useState<'capture' | 'review' | 'confirm' | 'saving' | 'done'>(
    'capture',
  )
  const [editing, setEditing] = useState(false)
  const [wholeDay, setWholeDay] = useState(false)
  const [complete, setComplete] = useState(false)
  const saving = useRef(false)
  const timezone = shopZone(shop?.fields)
  const today = shopNow(timezone).date
  const checked = useDaySales(today)
  const existing = checked.rows ?? []
  const phase = !checked.rows
    ? 'loading'
    : existing.length && !editing && stage === 'capture'
      ? 'closed'
      : stage
  const [failed, setFailed] = useState('')
  const [dropped, setDropped] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState({ revenue: 0, stock: 0, items: 0 })
  const [reward, setReward] = useState<CloseReward | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const pending = useRef<Kind>('sales')
  const counter = useRef(0)
  const progress = useRef({ stock: 'notSaved', sales: 'notSaved', date: '' })
  const [saveStarted, setSaveStarted] = useState(false)
  // Typed sales lines: the way forward when a photo can't be read (or there's no connection).
  const [typed, setTyped] = useState<Line[]>([])
  const [typing, setTyping] = useState(false)
  // A typed line that is filled in but not added yet still counts, and is added on Review.
  const [draft, setDraft] = useState<Line | null>(null)
  const next = useNextStepsCopy()
  const online = useOnline()
  const started = useRef(false)
  useEffect(() => {
    if (phase !== 'capture' || !initial || !shop || started.current) return
    started.current = true
    void read(initial.kind, initial.file)
    // Read once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])
  if (!shop) return null

  async function read(kind: Kind, file: File) {
    if (!shop) return
    const id = ++counter.current
    const url = URL.createObjectURL(file)
    setShots((all) => [
      ...all,
      { id, kind, url, state: 'reading', lines: [], fixture: false, date: '' },
    ])
    try {
      const result = await ws.api<{ lines: Line[]; fixture: boolean; date: string }>(
        `/businesses/${encodeURIComponent(shop.id)}/day/read?kind=${kind}`,
        {
          method: 'POST',
          body: file,
          headers: { 'Content-Type': file.type || 'image/jpeg' },
          signal: AbortSignal.timeout(150_000),
        },
      )
      setShots((all) =>
        all.map((s) =>
          s.id === id
            ? {
                ...s,
                state: 'done',
                lines: result.lines,
                fixture: result.fixture,
                date: result.date,
              }
            : s,
        ),
      )
    } catch {
      setShots((all) => all.map((s) => (s.id === id ? { ...s, state: 'failed' } : s)))
    }
  }

  const done = shots.filter((s) => s.state === 'done')
  const key = (shot: Shot, index: number) => `${shot.id}:${index}`
  const sales = [
    ...done
      .filter((s) => s.kind === 'sales')
      .flatMap((s) => s.lines.map((line, i) => ({ line, key: key(s, i) }))),
    ...typed.map((line, i) => ({ line, key: `typed:${i}` })),
  ].filter(({ line, key: k }) => !dropped.has(k) && line.quantity !== null && line.amount !== null)
  const stock = done
    .filter((s) => s.kind !== 'sales')
    .flatMap((s) =>
      s.lines.map((line, i) => ({
        line,
        key: key(s, i),
        mode: s.kind === 'delivery' ? ('delivery' as const) : ('count' as const),
      })),
    )
    .filter(({ line, key: k }) => !dropped.has(k) && line.quantity !== null)
  const revenue = sales.reduce((sum, { line }) => sum + (line.amount ?? 0), 0)
  const fixture = done.some((s) => s.fixture)
  const day = done.find((s) => s.date)?.date ?? ''
  const minutes = shopNow(timezone).minutes
  const usualClose = closingMinutes(shop.fields, timezone)
  const pastUsualClose = usualClose !== null && minutes >= usualClose
  const looksComplete = wholeDay || pastUsualClose
  const early = !pastUsualClose && minutes < 16 * 60

  function requestSave() {
    if (early) setPhase('confirm')
    else void save()
  }

  async function save() {
    if (!shop || saving.current) return
    saving.current = true
    setComplete(looksComplete)
    setPhase('saving')
    setSaveStarted(true)
    setFailed('')
    const base = `/businesses/${encodeURIComponent(shop.id)}`
    const salesBody = sales.map(({ line }) => ({
      item: line.item,
      quantity: line.quantity ?? 0,
      amount: line.amount ?? 0,
    }))
    const stockBody = stock
      .filter(({ line }) => line.matched)
      .map(({ line, mode }) => ({ item: line.item, quantity: line.quantity ?? 0, mode }))
    try {
      // Stock first; saving it moves the shop's revision, so sales are sealed afterwards.
      if (stockBody.length && progress.current.stock !== 'saved') {
        const prepared = await ws.api<{ stock: Sealed | null; date: string }>(
          `${base}/day/prepare`,
          {
            method: 'POST',
            body: JSON.stringify({ date: progress.current.date || day || today, stock: stockBody }),
          },
        )
        progress.current.date = prepared.date
        if (prepared.stock) {
          progress.current.stock = 'unknown'
          await ws.api(`/proposals/${prepared.stock.id}/approve`, {
            method: 'POST',
            body: JSON.stringify({ digest: prepared.stock.digest }),
          })
          progress.current.stock = 'saved'
        }
      }
      if (salesBody.length && progress.current.sales !== 'saved') {
        const prepared = await ws.api<{
          sales: { import_id: string; digest: string } | null
          date: string
        }>(`${base}/day/prepare`, {
          method: 'POST',
          body: JSON.stringify({ date: progress.current.date || day || today, sales: salesBody }),
        })
        progress.current.date = prepared.date
        if (prepared.sales) {
          progress.current.sales = 'unknown'
          await ws.api(`${base}/import/${prepared.sales.import_id}/approve`, {
            method: 'POST',
            body: JSON.stringify({ digest: prepared.sales.digest }),
          })
          progress.current.sales = 'saved'
        }
      }
      setSaved({
        revenue,
        stock: stockBody.length,
        items: salesBody.reduce((sum, row) => sum + row.quantity, 0),
      })
      const savedDay = progress.current.date || day
      const [facts] = await Promise.all([
        // What the day pays back, from the saved records; the screen still closes without it.
        salesBody.length && savedDay
          ? ws
              .api<CloseReward | null>(`${base}/day/${encodeURIComponent(savedDay)}/reward`, {
                signal: AbortSignal.timeout(6000),
              })
              .catch(() => null)
          : Promise.resolve(null),
        ws.reload(),
      ])
      setReward(facts)
      countClosed(ws)
      dismissFreshness(`chalkboard.closeday.${scope}.${shop.id}`, progress.current.date || day)
      setPhase('done')
    } catch {
      const status = (value: string) =>
        value === 'saved' ? t.savedState : value === 'unknown' ? t.unknownState : t.notSavedState
      setFailed(
        [
          t.saveFailed,
          ...(stockBody.length ? [`${t.stockTitle}: ${status(progress.current.stock)}.`] : []),
          ...(salesBody.length ? [`${t.salesTitle}: ${status(progress.current.sales)}.`] : []),
        ].join(' '),
      )
      setPhase('review')
    } finally {
      saving.current = false
    }
  }

  const lineCount = done.reduce((n, s) => n + s.lines.length, 0) + typed.length + (draft ? 1 : 0)
  const trouble = !online || shots.some((s) => s.state === 'failed')
  const typeButton = (
    <Button
      startIcon={<Keyboard size={18} />}
      onClick={() => setTyping(true)}
      color={trouble ? 'inherit' : 'primary'}
    >
      {next.typeNumbers}
    </Button>
  )

  // What went well leads: the units sold, named when it was one item, and the best seller.
  const soldCount = reward?.items ?? saved.items
  const byItem = new Map<string, number>()
  for (const { line } of sales)
    byItem.set(line.item, (byItem.get(line.item) ?? 0) + (line.quantity ?? 0))
  const ranked = [...byItem].sort((x, y) => y[1] - x[1])
  const number = new Intl.NumberFormat(locale)
  const soldLine =
    ranked.length === 1 && t.soldOf
      ? t.soldOf
          .replace('{n}', number.format(soldCount))
          .replace('{item}', productName(ranked[0]![0], locale))
      : closeDayCount(locale, 'soldItems', soldCount)
  const bestLine =
    ranked.length > 1 && t.bestSeller
      ? t.bestSeller
          .replace('{item}', productName(ranked[0]![0], locale))
          .replace('{n}', number.format(ranked[0]![1]))
      : ''

  const kinds: { kind: Kind; icon: ReactNode; title: string; hint: string }[] = [
    {
      kind: 'sales',
      icon: (
        <Typography aria-hidden="true" variant="headlineSmall">
          {currencySymbol(currency)}
        </Typography>
      ),
      title: t.till,
      hint: t.tillHint,
    },
    { kind: 'delivery', icon: <Truck size={26} />, title: t.delivery, hint: t.deliveryHint },
    { kind: 'stock_count', icon: <ClipboardList size={26} />, title: t.count, hint: t.countHint },
  ]

  return (
    <Dialog
      open
      fullScreen={phone}
      fullWidth
      maxWidth="sm"
      onClose={phase === 'saving' ? undefined : onClose}
      aria-labelledby="close-day-title"
      slotProps={{ paper: { sx: { bgcolor: roles.surface, ...motion } } }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          px: 3,
          pt: 'max(12px, env(safe-area-inset-top))',
          minHeight: 64,
        }}
      >
        <Typography id="close-day-title" component="h2" variant="titleLarge" sx={{ flex: 1 }}>
          {t.title}
        </Typography>
        {!phone && phase !== 'confirm' && (
          <IconButton aria-label={t.close} onClick={onClose} disabled={phase === 'saving'}>
            <X size={22} />
          </IconButton>
        )}
      </Stack>

      <Box sx={{ px: 4, pb: 4, flex: 1, overflowY: 'auto' }}>
        {phase === 'loading' && (
          <Stack spacing={2} role="status">
            {checked.failed ? (
              <Alert severity="error">{t.loadFailed}</Alert>
            ) : (
              <Typography>{t.loading}</Typography>
            )}
            {checked.failed && <Button onClick={checked.retry}>{t.retry}</Button>}
          </Stack>
        )}
        {phase === 'closed' && (
          <Typography variant="headlineSmall" sx={{ mt: 3 }}>
            {t.alreadyClosed.replace(
              '{sales}',
              formatShopPrice(
                existing.reduce((sum, row) => sum + (row.revenue ?? 0), 0),
                currency,
                locale,
              ),
            )}
          </Typography>
        )}
        {phase === 'capture' && (
          <>
            <CloseDaySupply />
            <Typography color="text.secondary" sx={{ animation: `cdRise 400ms ${EASE} both` }}>
              {t.intro}
            </Typography>
            <Stack spacing={2} sx={{ mt: 3 }}>
              {kinds.map((entry, index) => {
                const count = shots.filter((s) => s.kind === entry.kind).length
                return (
                  <Box
                    key={entry.kind}
                    component="button"
                    type="button"
                    onClick={() => {
                      pending.current = entry.kind
                      input.current?.click()
                    }}
                    sx={{
                      all: 'unset',
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '52px 1fr auto',
                      alignItems: 'center',
                      gap: 3,
                      p: 3,
                      borderRadius: '20px',
                      bgcolor: roles.surfaceContainerLow,
                      border: `1px solid ${roles.outlineVariant}`,
                      animation: `cdRise 400ms ${EASE} both`,
                      animationDelay: `${80 + index * 70}ms`,
                      transition: `transform 160ms ${EASE}`,
                      '&:active': { transform: 'scale(0.98)' },
                      '&:focus-visible': { outline: `3px solid ${roles.primary}` },
                    }}
                  >
                    <Box
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: '16px',
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: roles.primaryContainer,
                        color: roles.onPrimaryContainer,
                      }}
                    >
                      {entry.icon}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="titleMedium">{entry.title}</Typography>
                      {entry.hint !== entry.title && (
                        <Typography variant="bodySmall" color="text.secondary">
                          {entry.hint}
                        </Typography>
                      )}
                    </Box>
                    {count > 0 ? (
                      <Chip
                        size="small"
                        label={count}
                        sx={{ animation: `cdPop 300ms ${EASE} both` }}
                      />
                    ) : (
                      <Camera size={22} aria-hidden="true" />
                    )}
                  </Box>
                )
              })}
            </Stack>

            {shots.length > 0 && (
              <Box
                sx={{
                  mt: 4,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                  gap: 2,
                }}
              >
                {shots.map((shot) => (
                  <Box
                    key={shot.id}
                    sx={{
                      position: 'relative',
                      aspectRatio: '3 / 4',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      bgcolor: roles.surfaceContainerHigh,
                      animation: `cdPop 360ms ${EASE} both`,
                    }}
                  >
                    <Box
                      component="img"
                      src={shot.url}
                      alt=""
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {shot.state === 'reading' && (
                      // A scanning beam while the photo is read.
                      <Box
                        aria-hidden="true"
                        sx={{
                          position: 'absolute',
                          inset: 0,
                          background: `linear-gradient(180deg, transparent 40%, ${roles.primary}66 50%, transparent 60%)`,
                          animation: 'cdSweep 1.2s ease-in-out infinite alternate',
                        }}
                      />
                    )}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 6,
                        right: 6,
                        bottom: 6,
                        px: 1,
                        py: 0.5,
                        borderRadius: '10px',
                        bgcolor: 'rgba(0,0,0,0.62)',
                        color: '#fff',
                        fontSize: 12,
                        textAlign: 'center',
                      }}
                    >
                      {shot.state === 'reading'
                        ? t.reading
                        : shot.state === 'failed'
                          ? t.readFailed
                          : closeDayCount(locale, 'lines', shot.lines.length)}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
            {!typing &&
              (trouble ? (
                <Alert severity="warning" sx={{ mt: 4 }} data-testid="close-day-trouble">
                  {online ? next.readFailedHelp : next.offlineHelp}
                  <Box sx={{ mt: 1, ml: -2 }}>{typeButton}</Box>
                </Alert>
              ) : (
                <Box sx={{ mt: 3, ml: -2 }}>{typeButton}</Box>
              ))}
            {typing && (
              <TypedSales
                lines={typed}
                // A name can repeat across units (Special Chai per cup and per pot).
                products={[...new Set(ws.products.map((p) => p.name))]}
                currency={currency}
                onAdd={(line) => setTyped((all) => [...all, line])}
                onDraft={setDraft}
              />
            )}
            <AskHint id="close_day" />
          </>
        )}

        {(phase === 'review' || phase === 'saving' || phase === 'confirm') && (
          <Box sx={{ animation: `cdRise 400ms ${EASE} both` }}>
            {!pastUsualClose && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={wholeDay}
                    onChange={(event) => setWholeDay(event.target.checked)}
                    disabled={phase === 'saving'}
                  />
                }
                label={t.wholeDay}
                sx={{ minHeight: 48, mb: 2 }}
              />
            )}
            {fixture && (
              <Alert severity="info" sx={{ mb: 3 }}>
                {t.fixture}
              </Alert>
            )}
            {failed && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {failed}
              </Alert>
            )}
            {sales.length === 0 && stock.length === 0 && (
              <Alert severity="warning" sx={{ mb: 3 }}>
                {t.reviewEmpty}
              </Alert>
            )}
            {sales.length > 0 && (
              <Box>
                <Typography variant="labelLarge" color="text.secondary">
                  {t.salesTitle}
                </Typography>
                <Typography variant="displaySmall" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatShopPrice(toMinor(revenue, currency), currency)}
                </Typography>
                <ReviewList
                  rows={sales.map(({ line, key: k }) => ({
                    key: k,
                    label: line.item,
                    sub: line.read_as !== line.item ? t.readAs.replace('{text}', line.read_as) : '',
                    value: `${new Intl.NumberFormat(locale).format(line.quantity ?? 0)} · ${formatShopPrice(toMinor(line.amount ?? 0, currency), currency, locale)}`,
                    warn: !line.matched,
                  }))}
                  onDrop={(k) => setDropped((all) => new Set(all).add(k))}
                  dropLabel={t.remove}
                  disabled={saveStarted}
                />
              </Box>
            )}
            {stock.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="labelLarge" color="text.secondary">
                  {t.stockTitle}
                </Typography>
                <ReviewList
                  rows={stock.map(({ line, key: k, mode }) => ({
                    key: k,
                    label: line.item,
                    sub: line.matched ? '' : t.notOnMenu,
                    value: `${mode === 'delivery' ? '+' : '= '}${new Intl.NumberFormat(locale).format(line.quantity ?? 0)}`,
                    warn: !line.matched,
                  }))}
                  onDrop={(k) => setDropped((all) => new Set(all).add(k))}
                  dropLabel={t.remove}
                  disabled={saveStarted}
                />
              </Box>
            )}
          </Box>
        )}

        {phase === 'done' && (
          <Stack sx={{ alignItems: 'center', textAlign: 'center', pt: 8 }}>
            <Box
              component="svg"
              viewBox="0 0 96 96"
              sx={{ width: 120, height: 120 }}
              aria-hidden="true"
            >
              <circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke={roles.primary}
                strokeWidth="5"
                strokeDasharray="277"
                strokeDashoffset="277"
                style={{ animation: `cdDraw 700ms ${EASE} forwards` }}
              />
              <path
                d="M30 50 l12 12 l24 -26"
                fill="none"
                stroke={roles.primary}
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="60"
                strokeDashoffset="60"
                style={{ animation: `cdDraw 450ms ${EASE} 600ms forwards` }}
              />
            </Box>
            {(reward || saved.items > 0) && (
              <Typography variant="headlineSmall" sx={{ mt: 3 }}>
                {soldLine}
              </Typography>
            )}
            <Typography
              variant="headlineSmall"
              sx={{ mt: 3, animation: `cdRise 400ms ${EASE} 700ms both` }}
            >
              {reward?.total != null
                ? t.doneTotal.replace('{sales}', formatShopPrice(reward.total, currency, locale))
                : t.doneTitle}
            </Typography>
            {bestLine && (
              <Typography variant="bodyLarge" sx={{ mt: 2, overflowWrap: 'anywhere' }}>
                {bestLine}
              </Typography>
            )}
            {t.thanks && (
              <Typography variant="bodyLarge" sx={{ mt: 1 }}>
                {t.thanks}
              </Typography>
            )}
            {complete && <CloseRewardLines reward={reward} />}
            <Typography
              variant="bodyMedium"
              color="text.secondary"
              sx={{ mt: 2, animation: `cdRise 400ms ${EASE} 940ms both` }}
            >
              {[
                reward?.total == null &&
                  saved.revenue > 0 &&
                  t.doneSales.replace(
                    '{sales}',
                    formatShopPrice(toMinor(saved.revenue, currency), currency),
                  ),
                saved.stock > 0 && t.doneStock.replace('{n}', String(saved.stock)),
                t.donePlan,
              ]
                .filter(Boolean)
                .join(' ')}
            </Typography>
            <TomorrowPromise />
          </Stack>
        )}
      </Box>

      <Box
        sx={{
          px: 4,
          pt: 2,
          pb: 'max(16px, env(safe-area-inset-bottom))',
          borderTop: `1px solid ${roles.outlineVariant}`,
          display: 'flex',
          gap: 2,
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        {/* On a phone the way out sits in the thumb zone; wider windows keep the corner X. */}
        {phone && phase !== 'saving' && phase !== 'done' && phase !== 'confirm' && (
          <Button onClick={onClose} sx={{ flex: 1, whiteSpace: 'nowrap' }}>
            {t.close}
          </Button>
        )}
        {phase === 'closed' && (
          <Button
            variant="contained"
            onClick={() => {
              // Edit the saved figures; an incoming chat photo must not add them again.
              started.current = true
              setEditing(true)
              setTyped(
                existing.map((row) => ({
                  item: row.item,
                  read_as: row.item,
                  quantity: row.quantity,
                  amount: toMajor(row.revenue ?? 0, currency),
                  matched: ws.products.some((product) => product.name === row.item),
                })),
              )
              setPhase('capture')
            }}
          >
            {t.edit}
          </Button>
        )}
        {phase === 'capture' && (
          <Button
            variant="contained"
            size="large"
            disabled={lineCount === 0 || shots.some((s) => s.state === 'reading')}
            onClick={() => {
              if (draft) {
                setTyped((all) => [...all, draft])
                setDraft(null)
              }
              setPhase('review')
            }}
            sx={{ flex: 1 }}
          >
            {closeDayCount(locale, 'review', lineCount)}
          </Button>
        )}
        {(phase === 'review' || phase === 'saving' || phase === 'confirm') && (
          <>
            <Button
              onClick={() => setPhase('capture')}
              disabled={saveStarted || phase === 'confirm'}
              sx={{ flex: phone ? 1 : undefined, whiteSpace: 'nowrap' }}
            >
              {t.back}
            </Button>
            <Button
              variant="contained"
              size="large"
              startIcon={
                phase === 'saving' ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <Check size={18} />
                )
              }
              disabled={
                phase !== 'review' || (sales.length === 0 && !stock.some((s) => s.line.matched))
              }
              onClick={requestSave}
              // On a phone the main action takes the first full-width line, so no label wraps.
              sx={phone ? { flex: '1 1 100%', order: -1, whiteSpace: 'nowrap' } : undefined}
            >
              {t.save}
            </Button>
          </>
        )}
        {phase === 'done' && (
          <Button variant="contained" size="large" onClick={onClose} sx={{ flex: 1 }}>
            {t.finish}
          </Button>
        )}
      </Box>
      {phase === 'confirm' && (
        <Dialog
          open
          maxWidth="xs"
          fullWidth
          onClose={() => setPhase('review')}
          aria-labelledby="close-day-early-title"
        >
          <DialogTitle id="close-day-early-title" component="h3" sx={{ typography: 'titleLarge' }}>
            {t.early}
          </DialogTitle>
          {t.earlyWhy && (
            <DialogContent>
              <Typography color="text.secondary">{t.earlyWhy}</Typography>
            </DialogContent>
          )}
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPhase('review')} sx={{ minHeight: 48 }}>
              {t.close}
            </Button>
            <Button variant="contained" onClick={() => void save()} sx={{ minHeight: 48 }}>
              {t.anyway}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void read(pending.current, file)
        }}
      />
    </Dialog>
  )
}

/**
 * The close screen's reward (HABIT change 3): only what the saved records say. A comparison is
 * with the same weekday only, and is left out without one (a shop's first week has none).
 */
function CloseRewardLines({ reward }: { reward: CloseReward | null }) {
  const locale = useLocale()
  const t = closeDayCopy(locale)
  const ws = useWorkspace()
  const currency = shopCurrency(ws.active)
  if (!reward) return null
  const lines: string[] = []
  const same = reward.same_weekday
  if (same && reward.total != null) {
    const then = new Date(`${same.date}T12:00:00Z`)
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      then,
    )
    const when =
      same.weeks_ago === 1
        ? t.lastWeekday.replace('{weekday}', weekday)
        : new Intl.DateTimeFormat(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }).format(then)
    const amount = wholeMoney(Math.abs(same.difference), currency, locale)
    const kind = comparisonKind(toMajor(same.difference, currency))
    lines.push(
      (kind === 'more' ? t.moreThan : kind === 'less' ? t.lessThan : t.sameAs)
        .replace('{amount}', amount)
        .replace('{when}', when),
    )
  }
  // Only a forecast the day met is shown; falling short of one is not news worth a screen.
  if (reward.forecast && reward.forecast.sold >= reward.forecast.forecast) {
    const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    lines.push(
      t.forecastSold
        .replace('{forecast}', number.format(reward.forecast.forecast))
        .replace('{item}', productName(reward.forecast.item, locale))
        .replace('{sold}', number.format(reward.forecast.sold)),
    )
  }
  if (!lines.length) return null
  return (
    <Stack
      data-testid="close-reward"
      sx={{ mt: 2, gap: 1, animation: `cdRise 400ms ${EASE} 820ms both` }}
    >
      {lines.map((line) => (
        <Typography key={line} variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
          {line}
        </Typography>
      ))}
    </Stack>
  )
}

/** A day's takings read best whole: ₹2,490, not ₹2,490.00. */
function wholeMoney(minor: number, currency: string, locale: string): string {
  return formatAmount(Math.round(toMajor(minor, currency)), currency, locale)
}

function ReviewList({
  rows,
  onDrop,
  dropLabel,
  disabled,
}: {
  rows: { key: string; label: string; sub: string; value: string; warn: boolean }[]
  onDrop: (key: string) => void
  dropLabel: string
  disabled: boolean
}) {
  const roles = useTheme().material
  return (
    <Box component="ul" sx={{ m: 0, mt: 2, p: 0, listStyle: 'none' }}>
      {rows.map((row, index) => (
        <Box
          component="li"
          key={row.key}
          sx={{
            display: 'grid',
            // minmax(0, 1fr) lets long names wrap; 48px fits the 48px remove target.
            gridTemplateColumns: 'minmax(0, 1fr) auto 48px',
            alignItems: 'center',
            gap: 2,
            py: 1.5,
            borderBottom: `1px solid ${roles.outlineVariant}`,
            animation: `cdRise 320ms ${EASE} both`,
            animationDelay: `${index * 40}ms`,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
              {row.label}
            </Typography>
            {row.sub && (
              <Typography variant="bodySmall" color={row.warn ? 'error' : 'text.secondary'}>
                {row.sub}
              </Typography>
            )}
          </Box>
          <Typography variant="bodyLarge" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {row.value}
          </Typography>
          <IconButton
            aria-label={`${dropLabel}: ${row.label}`}
            onClick={() => onDrop(row.key)}
            disabled={disabled}
          >
            <X size={16} />
          </IconButton>
        </Box>
      ))}
    </Box>
  )
}

/** Sales typed by hand: item, quantity and line total; they join the same one review. */
function TypedSales({
  lines,
  products,
  currency,
  onAdd,
  onDraft,
}: {
  lines: Line[]
  products: string[]
  currency: string
  onAdd: (line: Line) => void
  onDraft: (line: Line | null) => void
}) {
  const next = useNextStepsCopy()
  const locale = useLocale()
  const numberLocale = moneyLocale(currency, locale) ?? locale
  const [item, setItem] = useState('')
  const [qty, setQty] = useState('')
  const [amount, setAmount] = useState('')
  const [invalid, setInvalid] = useState(false)
  const quantity = parseCloseDayNumber(qty, numberLocale, currency)
  const total = parseCloseDayNumber(amount, numberLocale, currency)
  const numberError = closeDayCopy(locale).numberInvalid.replace(
    '{example}',
    new Intl.NumberFormat(numberLocale).format(exponent(currency) === 0 ? 1000 : 1000.5),
  )
  const known = products.find((name) => name.toLowerCase() === item.trim().toLowerCase())
  const filled: Line | null =
    item.trim() && quantity !== null && total !== null
      ? {
          item: known ?? item.trim(),
          read_as: known ?? item.trim(),
          quantity,
          amount: total,
          matched: Boolean(known),
        }
      : null
  const filledKey = filled && JSON.stringify(filled)
  useEffect(() => {
    onDraft(filled)
    return () => onDraft(null)
    // The line is rebuilt each render; its content is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filledKey])
  function add(form: HTMLFormElement) {
    if (!item.trim() || quantity === null || total === null) {
      setInvalid(true)
      const name = !item.trim() ? 'item' : quantity === null ? 'quantity' : 'amount'
      ;(form.elements.namedItem(name) as HTMLInputElement | null)?.focus()
      return
    }
    if (filled) onAdd(filled)
    setItem('')
    setQty('')
    setAmount('')
    setInvalid(false)
  }
  return (
    <Box
      component="form"
      noValidate
      aria-labelledby="close-day-typed-title"
      data-testid="close-day-typed"
      onSubmit={(event) => {
        event.preventDefault()
        add(event.currentTarget)
      }}
      sx={{ mt: 4, animation: `cdRise 320ms ${EASE} both` }}
    >
      <Typography id="close-day-typed-title" component="h3" variant="titleMedium" sx={{ mb: 2 }}>
        {next.manualTitle}
      </Typography>
      <Stack spacing={2}>
        <TextField
          autoFocus
          name="item"
          label={next.manualItem}
          value={item}
          error={invalid && !item.trim()}
          helperText={invalid && !item.trim() ? next.manualInvalid : undefined}
          onChange={(event) => setItem(event.target.value.slice(0, 180))}
          slotProps={{ htmlInput: { list: 'close-day-items', autoComplete: 'off' } }}
        />
        <datalist id="close-day-items">
          {products.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2 }}>
          <TextField
            name="quantity"
            label={next.manualQty}
            value={qty}
            error={invalid && quantity === null}
            helperText={invalid && quantity === null ? numberError : undefined}
            onChange={(event) => setQty(event.target.value)}
            slotProps={{
              htmlInput: { inputMode: 'decimal', autoComplete: 'off' },
              formHelperText: { 'aria-live': 'polite' },
            }}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <TextField
            name="amount"
            label={`${next.manualAmount} (${currencySymbol(currency)})`}
            value={amount}
            error={invalid && total === null}
            helperText={invalid && total === null ? numberError : undefined}
            onChange={(event) => setAmount(event.target.value)}
            slotProps={{
              htmlInput: { inputMode: 'decimal', autoComplete: 'off' },
              formHelperText: { 'aria-live': 'polite' },
            }}
            sx={{ flex: 1, minWidth: 0 }}
          />
        </Stack>
        <Button
          type="submit"
          variant="outlined"
          startIcon={<Plus size={18} />}
          sx={{ alignSelf: 'flex-start' }}
        >
          {next.addLine}
        </Button>
        {lines.length > 0 && (
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {lines.map((line, index) => (
              <Typography
                component="li"
                key={index}
                variant="bodyMedium"
                sx={{ overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}
              >
                {line.item} · {line.quantity} ·{' '}
                {formatShopPrice(toMinor(line.amount ?? 0, currency), currency)}
              </Typography>
            ))}
          </Box>
        )}
      </Stack>
    </Box>
  )
}
