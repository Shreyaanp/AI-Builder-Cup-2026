import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, X } from 'lucide-react'
import { fieldFade, HAND_FONT, scrollArea, shape } from '../../design/theme'
import { useRewardCopy } from '../rewards/strings'
import { HoursEditor } from '../shop/Hours'
import { useShopCopy } from '../shop/strings'
import { UNITS, unitLabel } from '../shop/units'
import type { Business, Product } from './api'
import { factName, factSuggestions } from './factNames'
import { CURRENCIES, currencySymbol, toMajor, toMinor } from './format'
import { useInChatCopy, type DetailStep } from './inChatCopy'
import { MapCard, type PinChoice } from './MapCard'
import { useWorkspace } from './workspaceContext'
import { useNewShopCopy } from './newShopCopy'
import { useCopy } from './strings'
import { shopRegion } from '../../region/region'

type Row = { key: string; name: string; price: string; unit: string }
export type GuidedResult = {
  fields: Business['fields']
  products: Product[]
  location: PinChoice | null
}

const NEW_STEPS: DetailStep[] = [
  'name',
  'category',
  'products',
  'location',
  'hours',
  'phone',
  'payment',
  'delivery',
]
const EDIT_STEPS: DetailStep[] = [
  'name',
  'category',
  'location',
  'hours',
  'phone',
  'payment',
  'delivery',
  'reward',
]

const newRow = (): Row => ({ key: crypto.randomUUID(), name: '', price: '', unit: 'item' })

/**
 * A long form made phone-friendly: one question per screen, big targets, smart defaults,
 * Back/Next and progress, and a step row to jump anywhere. Used for "Type it in instead" in
 * the new-shop flow and for "Edit details" of a saved shop. Nothing is saved here: the result
 * goes to the usual review first.
 */
export function GuidedDetails({
  mode,
  initial,
  initialProducts = [],
  startStep,
  busy,
  error,
  titleId,
  onCancel,
  onSubmit,
  onDirty,
}: {
  mode: 'new' | 'edit'
  initial: Business['fields']
  initialProducts?: Product[]
  startStep?: DetailStep
  busy: boolean
  error: string
  titleId: string
  onCancel: () => void
  onSubmit: (result: GuidedResult) => void
  onDirty?: (dirty: boolean) => void
}) {
  const { readOnlyMessage } = useWorkspace()
  const t = useCopy()
  const c = useInChatCopy()
  const f = useNewShopCopy()
  const shopCopy = useShopCopy()
  const rewards = useRewardCopy()
  const roles = useTheme().material
  const steps = mode === 'new' ? NEW_STEPS : EDIT_STEPS
  const [index, setIndex] = useState(Math.max(0, steps.indexOf(startStep ?? steps[0]!)))
  const step = steps[index]!
  const [fields, setFields] = useState(initial)
  const currency = fields.currency || shopRegion(fields).currency
  const [rows, setRows] = useState<Row[]>(() =>
    initialProducts.length
      ? initialProducts.map((p) => ({
          key: crypto.randomUUID(),
          name: p.name,
          price: String(toMajor(p.price, currency)),
          unit: p.unit,
        }))
      : [newRow()],
  )
  const [stamps, setStamps] = useState(String(initial.stamps_needed ?? 8))
  const [pin, setPin] = useState<{ choice: PinChoice; label: string } | null>(null)
  const [problem, setProblem] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const page = useRef<HTMLDivElement>(null)
  // Where the focus goes after a move: the new question, or the answer that needs fixing.
  const [focus, setFocus] = useState({ tick: 0, invalid: false })
  const suggestions = factSuggestions(shopRegion(fields))

  const dirty =
    JSON.stringify(fields) !== JSON.stringify(initial) ||
    stamps !== String(initial.stamps_needed ?? 8) ||
    rows.some((row) => row.name.trim()) ||
    pin !== null
  useEffect(() => {
    onDirty?.(dirty)
  }, [dirty, onDirty])
  // Each new question takes the focus, so a screen reader hears it and the keyboard follows.
  useEffect(() => {
    if (focus.tick === 0 && mode === 'edit' && !startStep) return
    const invalid = focus.invalid
      ? page.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
      : null
    ;(invalid ?? heading.current)?.focus({ preventScroll: !invalid })
  }, [focus, mode, startStep])

  const invalidStamps = !/^\d+$/.test(stamps) || Number(stamps) < 3 || Number(stamps) > 20
  const invalidPayments =
    (fields.payment_methods ?? []).some((name) => !name.trim() || [...name.trim()].length > 40) ||
    (fields.payment_methods?.length ?? 0) > 8
  const invalidDelivery =
    fields.delivery != null && (!fields.delivery.trim() || [...fields.delivery.trim()].length > 40)
  const filled: Record<DetailStep, boolean> = {
    name: Boolean(fields.name.trim()),
    category: Boolean(fields.category.trim()),
    products: rows.some((row) => row.name.trim() && row.price.trim()),
    location: Boolean(fields.location.trim() || pin || fields.lat != null),
    hours: Boolean(fields.weekly_hours?.length || fields.hours.trim()),
    phone: Boolean(fields.phone.trim()),
    payment: Boolean(fields.payment_methods?.length),
    delivery: fields.delivery != null,
    reward: Boolean(fields.reward_text?.trim()),
  }

  function go(next: number) {
    setProblem('')
    setIndex(Math.max(0, Math.min(steps.length - 1, next)))
    setFocus((current) => ({ tick: current.tick + 1, invalid: false }))
  }
  function finish() {
    setProblem('')
    const fail = (message: string, at: DetailStep) => {
      setProblem(message)
      setIndex(steps.indexOf(at))
      setFocus((current) => ({ tick: current.tick + 1, invalid: true }))
    }
    if (!fields.name.trim()) return fail(t.enterName, 'name')
    if (invalidPayments) return fail(t.factInputHelp, 'payment')
    if (invalidDelivery) return fail(t.deliveryInputHelp, 'delivery')
    if (mode === 'edit' && invalidStamps) return fail(rewards.neededHelp, 'reward')
    const products: Product[] = rows
      .filter((row) => row.name.trim() && Number.isFinite(Number(row.price)) && row.price.trim())
      .map((row) => ({
        name: row.name.trim(),
        price: toMinor(Number(row.price), currency),
        unit: row.unit,
        stock: null,
        available: true,
      }))
    onSubmit({
      fields: {
        ...fields,
        name: fields.name.trim(),
        ...(mode === 'edit' ? { stamps_needed: Number(stamps) } : {}),
      },
      products,
      location: pin?.choice ?? null,
    })
  }
  const last = index === steps.length - 1
  // Enter on a one-line answer moves on, like a keyboard's "next" key.
  const onEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (last) finish()
      else go(index + 1)
    }
  }
  const textInput = (enterKeyHint: 'next' | 'done' = last ? 'done' : 'next', maxLength = 180) => ({
    htmlInput: { enterKeyHint, maxLength },
  })
  const set = (patch: Partial<Business['fields']>) =>
    setFields((current) => ({ ...current, ...patch }))

  const pressed = (on: boolean) => ({
    height: 44,
    fontSize: '0.95rem',
    ...(on ? { bgcolor: roles.secondaryContainer, color: roles.onSecondaryContainer } : {}),
  })

  let body: ReactNode
  switch (step) {
    case 'name':
      body = (
        <TextField
          label={t.fields.name}
          id="guided-name"
          value={fields.name}
          required
          autoComplete="organization"
          error={problem === t.enterName && !fields.name.trim()}
          helperText={problem === t.enterName && !fields.name.trim() ? t.enterName : undefined}
          onChange={(event) => set({ name: event.target.value })}
          onKeyDown={onEnter}
          slotProps={textInput(undefined, 80)}
          fullWidth
        />
      )
      break
    case 'category':
      body = (
        <Stack spacing={2}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {c.kinds.map((kind) => (
              <Chip
                key={kind}
                label={kind}
                variant={fields.category === kind ? 'filled' : 'outlined'}
                aria-pressed={fields.category === kind}
                onClick={() => set({ category: fields.category === kind ? '' : kind })}
                sx={pressed(fields.category === kind)}
              />
            ))}
          </Stack>
          <TextField
            label={t.fields.category}
            value={fields.category}
            autoComplete="off"
            onChange={(event) => set({ category: event.target.value })}
            onKeyDown={onEnter}
            slotProps={textInput()}
            fullWidth
          />
        </Stack>
      )
      break
    case 'products':
      body = (
        <Stack spacing={2}>
          {rows.map((row, at) => (
            <Box
              key={row.key}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 112px 40px',
                gridTemplateAreas: '"name name remove" "price unit unit"',
                gap: 1,
                p: 1.5,
                borderRadius: `${shape.md}px`,
                bgcolor: roles.surfaceContainerLow,
                ...fieldFade,
              }}
            >
              <TextField
                label={t.productName}
                value={row.name}
                autoComplete="off"
                onChange={(event) =>
                  setRows(
                    rows.map((r) => (r.key === row.key ? { ...r, name: event.target.value } : r)),
                  )
                }
                slotProps={{ htmlInput: { maxLength: 120, enterKeyHint: 'next' } }}
                sx={{ gridArea: 'name' }}
              />
              <TextField
                label={t.price}
                value={row.price}
                autoComplete="off"
                onChange={(event) =>
                  setRows(
                    rows.map((r) =>
                      r.key === row.key ? { ...r, price: event.target.value.replace(',', '.') } : r,
                    ),
                  )
                }
                slotProps={{
                  htmlInput: { inputMode: 'decimal', enterKeyHint: 'next' },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">{currencySymbol(currency)}</InputAdornment>
                    ),
                  },
                }}
                sx={{ gridArea: 'price' }}
              />
              <TextField
                select
                label={shopCopy.unit}
                value={row.unit}
                onChange={(event) =>
                  setRows(
                    rows.map((r) => (r.key === row.key ? { ...r, unit: event.target.value } : r)),
                  )
                }
                sx={{ gridArea: 'unit' }}
              >
                {UNITS.map((unit) => (
                  <MenuItem key={unit} value={unit}>
                    {unitLabel(unit, shopCopy)}
                  </MenuItem>
                ))}
              </TextField>
              <Tooltip title={c.removeItem(row.name || String(at + 1))}>
                <span style={{ gridArea: 'remove', alignSelf: 'center' }}>
                  <IconButton
                    aria-label={c.removeItem(row.name || String(at + 1))}
                    disabled={rows.length === 1 && !row.name}
                    onClick={() =>
                      setRows(
                        rows.length === 1 ? [newRow()] : rows.filter((r) => r.key !== row.key),
                      )
                    }
                  >
                    <Trash2 size={20} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
          <Button
            variant="outlined"
            startIcon={<Plus size={20} />}
            onClick={() => setRows([...rows, newRow()])}
            sx={{ alignSelf: 'flex-start', minHeight: 48 }}
          >
            {c.addItem}
          </Button>
          <TextField
            select
            label={t.currency}
            value={currency}
            onChange={(event) => set({ currency: event.target.value })}
            sx={{ maxWidth: 240 }}
          >
            {[currency, ...CURRENCIES.filter((code) => code !== currency)].map((code) => (
              <MenuItem key={code} value={code}>
                {code} · {currencySymbol(code)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )
      break
    case 'location':
      body = (
        <Stack spacing={2}>
          <TextField
            label={t.fields.location}
            value={fields.location}
            autoComplete="street-address"
            onChange={(event) => set({ location: event.target.value })}
            onKeyDown={onEnter}
            slotProps={{ htmlInput: { maxLength: 300, enterKeyHint: last ? 'done' : 'next' } }}
            fullWidth
          />
          <MapCard
            initial={
              fields.lat != null && fields.lng != null ? { lat: fields.lat, lng: fields.lng } : null
            }
            done={null}
            onConfirm={async (choice, address) => {
              const label = address && !address.startsWith('Near ') ? address : ''
              setPin({ choice, label: address ?? '' })
              // A smart default: the address under the pin fills an empty address field.
              if (label && !fields.location.trim()) set({ location: label })
            }}
          />
          {pin && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: roles.primary }}>
              <Check size={18} aria-hidden="true" />
              <Typography variant="labelLarge" role="status">
                {c.pinSaved}
                {pin.label && pin.label !== 'Your current location'
                  ? `: ${pin.label.startsWith('Near ') ? f.near(pin.label.slice(5)) : pin.label}`
                  : ''}
              </Typography>
            </Stack>
          )}
        </Stack>
      )
      break
    case 'hours':
      body = (
        <Stack spacing={3}>
          <HoursEditor
            value={fields.weekly_hours ?? []}
            onChange={(weekly_hours) => set({ weekly_hours })}
          />
          <TextField
            label={shopCopy.hoursNote}
            value={fields.hours}
            autoComplete="off"
            onChange={(event) => set({ hours: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 180 } }}
            fullWidth
          />
        </Stack>
      )
      break
    case 'phone':
      body = (
        <TextField
          label={t.fields.phone}
          value={fields.phone}
          type="tel"
          autoComplete="tel"
          onChange={(event) => set({ phone: event.target.value })}
          onKeyDown={onEnter}
          slotProps={{
            htmlInput: { maxLength: 180, inputMode: 'tel', enterKeyHint: last ? 'done' : 'next' },
          }}
          fullWidth
        />
      )
      break
    case 'payment': {
      const chosen = fields.payment_methods ?? []
      body = (
        <Stack spacing={2}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {suggestions.payment.map((value) => {
              const on = chosen.includes(value)
              return (
                <Chip
                  key={value}
                  label={factName(value, t.paymentValues)}
                  icon={on ? <Check size={16} /> : undefined}
                  variant={on ? 'filled' : 'outlined'}
                  aria-pressed={on}
                  onClick={() =>
                    set({
                      payment_methods: on ? chosen.filter((v) => v !== value) : [...chosen, value],
                    })
                  }
                  sx={pressed(on)}
                />
              )
            })}
          </Stack>
          <Autocomplete
            multiple
            freeSolo
            autoSelect
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
            // The chips above hold the usual ones; this field holds any other name.
            options={[]}
            value={chosen.filter((value) => !suggestions.payment.includes(value))}
            getOptionLabel={(value) => factName(value, t.paymentValues)}
            onChange={(_, custom) =>
              set({
                payment_methods: [
                  ...chosen.filter((value) => suggestions.payment.includes(value)),
                  ...custom,
                ],
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                name="payment_methods"
                label={t.factNames.payment_methods}
                error={invalidPayments}
                helperText={t.factInputHelp}
              />
            )}
          />
        </Stack>
      )
      break
    }
    case 'delivery':
      body = (
        <Stack spacing={2}>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {suggestions.delivery.map((value) => {
              const on = fields.delivery === value
              return (
                <Chip
                  key={value}
                  label={factName(value, t.deliveryValues)}
                  icon={on ? <Check size={16} /> : undefined}
                  variant={on ? 'filled' : 'outlined'}
                  aria-pressed={on}
                  onClick={() => set({ delivery: on ? null : value })}
                  sx={pressed(on)}
                />
              )
            })}
          </Stack>
          <Autocomplete
            freeSolo
            autoSelect
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
            options={[]}
            value={
              fields.delivery && !suggestions.delivery.includes(fields.delivery)
                ? fields.delivery
                : null
            }
            getOptionLabel={(value) => factName(value, t.deliveryValues)}
            onChange={(_, delivery) => set({ delivery })}
            renderInput={(params) => (
              <TextField
                {...params}
                name="delivery"
                label={t.factNames.delivery}
                error={invalidDelivery}
                helperText={t.deliveryInputHelp}
              />
            )}
          />
        </Stack>
      )
      break
    case 'reward':
      body = (
        <Stack spacing={3}>
          <TextField
            label={rewards.reward}
            name="reward_text"
            value={fields.reward_text ?? ''}
            helperText={rewards.rewardHelp}
            slotProps={{ htmlInput: { maxLength: 80 } }}
            onChange={(event) => set({ reward_text: event.target.value })}
            fullWidth
          />
          <TextField
            label={rewards.needed}
            name="stamps_needed"
            type="number"
            value={stamps}
            required
            error={invalidStamps}
            helperText={rewards.neededHelp}
            slotProps={{ htmlInput: { min: 3, max: 20, step: 1, inputMode: 'numeric' } }}
            onChange={(event) => setStamps(event.target.value)}
            sx={{ maxWidth: 240 }}
          />
        </Stack>
      )
      break
  }

  const reviewButton = (
    <Button
      variant="contained"
      disabled={busy}
      startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <Check size={20} />}
      onClick={finish}
      sx={{ minHeight: 56, flex: 2, borderRadius: `${shape.full}px` }}
    >
      {mode === 'edit' ? t.reviewFirst : f.review}
    </Button>
  )
  return (
    <Box
      ref={page}
      data-testid="guided-details"
      data-step={step}
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 640,
        mx: 'auto',
        px: { xs: 4, sm: 6 },
        pt: 'env(safe-area-inset-top)',
      }}
    >
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56 }}>
        <Tooltip title={t.cancel}>
          <IconButton aria-label={t.cancel} onClick={onCancel} sx={{ ml: -1 }}>
            <X size={22} />
          </IconButton>
        </Tooltip>
        <Typography id={titleId} component="h1" variant="titleMedium" sx={{ flex: 1, minWidth: 0 }}>
          {mode === 'edit' ? t.editDetails : c.manualTitle}
        </Typography>
        {mode === 'edit' && !last && (
          <Button disabled={busy} onClick={finish}>
            {t.reviewFirst}
          </Button>
        )}
      </Box>
      <Typography variant="labelMedium" color="text.secondary" sx={{ mt: 1 }}>
        {c.stepOf(index + 1, steps.length)}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={((index + 1) / steps.length) * 100}
        aria-hidden="true"
        sx={{ mt: 1, height: 6, borderRadius: 3 }}
      />
      {/* Every step at a glance: jump straight to the one to change. */}
      <Box
        component="nav"
        aria-label={c.manualTitle}
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          py: 2,
          mx: { xs: -4, sm: 0 },
          px: { xs: 4, sm: 0 },
          // Fade the right edge so a clipped chip reads as "scroll for more".
          maskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent)',
          ...scrollArea,
        }}
      >
        {steps.map((name, at) => (
          <Chip
            key={name}
            label={c.stepNames[name]}
            icon={filled[name] ? <Check size={16} /> : undefined}
            variant={at === index ? 'filled' : 'outlined'}
            aria-current={at === index ? 'step' : undefined}
            onClick={() => go(at)}
            sx={{
              flexShrink: 0,
              height: 40,
              ...(at === index
                ? {
                    bgcolor: roles.primary,
                    color: roles.onPrimary,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }
                : {}),
            }}
          />
        ))}
      </Box>
      <Box key={step} sx={{ flex: 1, pt: 1, pb: 3, ...fieldFade }}>
        <Typography
          ref={heading}
          tabIndex={-1}
          component="h2"
          sx={{
            fontFamily: HAND_FONT,
            fontSize: { xs: '2.1rem', md: '2.6rem' },
            lineHeight: 1.1,
            '&:focus': { outline: 'none' },
          }}
        >
          {c.ask[step]}
        </Typography>
        <Typography variant="bodyLarge" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          {c.help[step]}
        </Typography>
        {body}
        {(problem || error) && (
          <Alert severity={readOnlyMessage ? 'info' : 'error'} sx={{ mt: 3 }}>
            {problem || error}
          </Alert>
        )}
      </Box>
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          display: 'flex',
          gap: 1.5,
          pt: 2,
          pb: 'calc(16px + env(safe-area-inset-bottom))',
          bgcolor: roles.surface,
          zIndex: 2,
        }}
      >
        <Button
          variant="outlined"
          startIcon={<ArrowLeft size={20} />}
          disabled={index === 0 || busy}
          onClick={() => go(index - 1)}
          sx={{ minHeight: 56, flex: 1, borderRadius: `${shape.full}px` }}
        >
          {c.back}
        </Button>
        {last ? (
          reviewButton
        ) : (
          <Button
            variant="contained"
            endIcon={<ArrowRight size={20} />}
            onClick={() => go(index + 1)}
            sx={{ minHeight: 56, flex: 2, borderRadius: `${shape.full}px` }}
          >
            {c.next}
          </Button>
        )}
      </Box>
    </Box>
  )
}
