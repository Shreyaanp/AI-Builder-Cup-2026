import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useLocale } from '../../state/hooks'
import { dealIn } from '../../design/chalkMotion'
import { useWorkspace } from '../v1/workspaceContext'
import type { Proposal } from '../v1/api'
import { useToolCopy } from './copy'
import { openOwnerFeature } from './entry'
import {
  paymentLink,
  PROVIDERS,
  PROVIDER_HOME,
  PROVIDER_NAMES,
  riderLink,
  validPin,
  validUpi,
} from './links'
import type { PaymentLink, RiderProvider } from './links'

/** Used unchanged by the feature screen and the coach tool's card. */
export function PaymentCard({ payment }: { payment: PaymentLink }) {
  const t = useToolCopy()
  const locale = useLocale()
  const [qr, setQr] = useState<{ url: string; image: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState('')
  const [attempt, setAttempt] = useState(0)
  // QR, copy/share and app link all encode the same locally validated URI.
  const checked = paymentLink(payment.upi_id, payment.payee, payment.amount, payment.note)
  const url = checked?.url ?? ''
  useEffect(() => {
    if (!url) return
    let live = true
    import('qrcode')
      .then((qr) => qr.toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: 'M' }))
      .then((image) => {
        if (live) {
          setQr({ url, image })
          setFailed(false)
        }
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [url, attempt])
  // Rebuild from validated fields, never navigate to a model-supplied URL.
  if (!checked) return null
  async function share(copy = false) {
    setStatus('')
    try {
      // Custom schemes are not accepted as Web Share URLs on all browsers; share as text.
      if (!copy && navigator.share)
        await navigator.share({ title: payment.payee, text: checked!.url })
      else {
        await navigator.clipboard.writeText(checked!.url)
        setStatus(t.copied)
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus(t.shareFailed)
    }
  }
  const image = qr?.url === url ? qr.image : null
  return (
    <Stack
      spacing={2}
      sx={{
        ...dealIn,
        border: 1,
        borderColor: 'divider',
        borderRadius: 3,
        p: 3,
        width: '100%',
        maxWidth: 480,
        overflowWrap: 'anywhere',
      }}
    >
      <Typography variant="headlineMedium" component="h2">
        {new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR' }).format(
          Number(payment.amount),
        )}
      </Typography>
      <Typography variant="titleMedium">{payment.payee}</Typography>
      <Typography variant="bodyMedium">
        {payment.upi_id}
        {payment.note ? ` · ${payment.note}` : ''}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary">
        {t.payHint}
      </Typography>
      <Box
        sx={{
          width: '100%',
          maxWidth: 240,
          aspectRatio: '1',
          alignSelf: 'center',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {image ? (
          <Box
            component="img"
            src={image}
            width={320}
            height={320}
            alt={`QR · ${payment.payee} · INR ${payment.amount}`}
            sx={{ width: '100%', maxWidth: 240, height: 'auto', alignSelf: 'center' }}
          />
        ) : failed ? (
          <Alert
            severity="error"
            action={<Button onClick={() => setAttempt((value) => value + 1)}>{t.create}</Button>}
          >
            {t.qrFailed}
          </Alert>
        ) : (
          <CircularProgress aria-label="QR" sx={{ alignSelf: 'center' }} />
        )}
      </Box>
      <Button variant="contained" href={checked.url}>
        {t.pay}
      </Button>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={() => void share(true)}>{t.copy}</Button>
        <Button onClick={() => void share()}>{t.share}</Button>
      </Stack>
      <Typography role="status" variant="bodyMedium">
        {status}
      </Typography>
      {status === t.shareFailed && (
        <TextField
          label={t.copy}
          value={checked.url}
          slotProps={{ input: { readOnly: true } }}
          onFocus={(event) => event.target.select()}
        />
      )}
    </Stack>
  )
}

export function PaymentsScreen() {
  const ws = useWorkspace()
  const t = useToolCopy()
  const shop = ws.active
  // Parent keys this screen by shop id, so drafts never cross shops.
  const [upi, setUpi] = useState(shop?.fields.upi_id ?? '')
  const [providers, setProviders] = useState<RiderProvider[]>(
    shop?.fields.rider_providers ?? [...PROVIDERS],
  )
  const [settings, setSettings] = useState(!shop?.fields.upi_id)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [drop, setDrop] = useState('')
  const [card, setCard] = useState<PaymentLink | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const upiField = useRef<HTMLInputElement>(null)
  const amountField = useRef<HTMLInputElement>(null)
  if (!shop)
    return (
      <Stack spacing={3} sx={{ py: 3 }}>
        <Button onClick={() => openOwnerFeature(null)}>{t.back}</Button>
        <Typography component="h1" variant="headlineMedium">
          {t.payTitle}
        </Typography>
        <Typography>{t.addShop}</Typography>
      </Stack>
    )
  const isInr = shop.fields.currency === 'INR'
  const pickup =
    shop.fields.lat != null && shop.fields.lng != null && !shop.fields.pin_demo
      ? { lat: shop.fields.lat, lng: shop.fields.lng, name: shop.fields.name }
      : null
  async function saveSettings() {
    setSubmitted(true)
    if (upi.trim() && !validUpi(upi.trim())) {
      upiField.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const proposal = await ws.api<Proposal>(
        `/businesses/${encodeURIComponent(shop!.id)}/update?revision=${shop!.revision}`,
        {
          method: 'POST',
          body: JSON.stringify({ ...shop!.fields, upi_id: upi.trim(), rider_providers: providers }),
        },
      )
      // The settings on screen are the exact fields the owner explicitly chose to save.
      await ws.confirm(proposal)
      setSettings(false)
      setSubmitted(false)
      setCard(null)
      setStatus(t.saved)
    } catch {
      setError(t.loadFailed)
    } finally {
      setBusy(false)
    }
  }
  function create() {
    setSubmitted(true)
    setStatus('')
    const next = paymentLink(shop!.fields.upi_id ?? '', shop!.fields.name, amount, note)
    if (!next) {
      amountField.current?.focus()
      return
    }
    setCard(next)
    setSubmitted(false)
  }
  return (
    <Stack spacing={3} sx={{ py: 3, maxWidth: 880, mx: 'auto' }}>
      <Button onClick={() => openOwnerFeature(null)} sx={{ alignSelf: 'flex-start' }}>
        {t.back}
      </Button>
      <Typography component="h1" variant="headlineMedium">
        {t.payTitle}
      </Typography>
      <Typography variant="titleMedium">{shop.fields.name}</Typography>
      {!card && (
        <Typography variant="bodyMedium" color="text.secondary">
          {t.payHint}
        </Typography>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Typography role="status">{status}</Typography>
      {settings ? (
        <Stack
          component="form"
          noValidate
          spacing={2}
          onSubmit={(event) => {
            event.preventDefault()
            void saveSettings()
          }}
        >
          <Typography component="h2" variant="titleLarge">
            {t.settings}
          </Typography>
          <TextField
            inputRef={upiField}
            disabled={busy}
            label={t.upiId}
            name="upi_id"
            autoComplete="off"
            value={upi}
            onChange={(event) => setUpi(event.target.value)}
            error={submitted && !!upi.trim() && !validUpi(upi.trim())}
            helperText={
              submitted && !!upi.trim() && !validUpi(upi.trim()) ? t.invalidUpi : undefined
            }
            slotProps={{ htmlInput: { maxLength: 320, spellCheck: false, autoCapitalize: 'none' } }}
          />
          <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
            <Typography component="legend" variant="titleSmall">
              {t.chooseProviders}
            </Typography>
            {PROVIDERS.map((provider) => (
              <FormControlLabel
                key={provider}
                label={PROVIDER_NAMES[provider]}
                sx={{ minHeight: 48, m: 0, mr: 2 }}
                control={
                  <Checkbox
                    disabled={busy}
                    checked={providers.includes(provider)}
                    onChange={(_, checked) =>
                      setProviders(
                        checked
                          ? [...providers, provider]
                          : providers.filter((value) => value !== provider),
                      )
                    }
                  />
                }
              />
            ))}
          </Box>
          <Button type="submit" variant="contained" loading={busy}>
            {t.save}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setSettings(false)
              setUpi(shop.fields.upi_id ?? '')
              setProviders(shop.fields.rider_providers ?? [...PROVIDERS])
              setSubmitted(false)
            }}
          >
            {t.back}
          </Button>
        </Stack>
      ) : (
        <>
          {!isInr ? (
            <Alert severity="info">{t.inrOnly}</Alert>
          ) : !shop.fields.upi_id ? (
            <Button variant="contained" onClick={() => setSettings(true)}>
              {t.settings}
            </Button>
          ) : card ? (
            <>
              <PaymentCard payment={card} />
              <Button sx={{ alignSelf: 'flex-start' }} onClick={() => setCard(null)}>
                {t.edit}
              </Button>
            </>
          ) : (
            <Stack
              component="form"
              noValidate
              spacing={2}
              onSubmit={(event) => {
                event.preventDefault()
                create()
              }}
            >
              <TextField
                inputRef={amountField}
                label={t.amount}
                name="amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                error={submitted}
                helperText={submitted ? t.invalidAmount : undefined}
                slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 16 } }}
              />
              <TextField
                label={t.note}
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
              <Button type="submit" variant="contained">
                {t.create}
              </Button>
            </Stack>
          )}
          <Button
            onClick={() => {
              setSettings(true)
              setCard(null)
              setSubmitted(false)
            }}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t.settings}
          </Button>
          <Box
            component="details"
            sx={{ pt: 2, '& summary': { minHeight: 48, cursor: 'pointer', display: 'list-item' } }}
          >
            <Typography component="summary" variant="titleLarge">
              {t.riderTitle}
            </Typography>
            <Stack spacing={2} sx={{ pt: 2 }}>
              <Typography variant="bodyMedium">{t.riderHint}</Typography>
              {!validPin(pickup) ? (
                <Alert severity="info">{t.pinMissing}</Alert>
              ) : (
                <>
                  <Typography variant="bodyMedium">
                    {pickup.name} · {pickup.lat}, {pickup.lng}
                  </Typography>
                  <TextField
                    label={t.drop}
                    name="drop"
                    autoComplete="street-address"
                    value={drop}
                    onChange={(event) => setDrop(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 300 } }}
                  />
                  {drop.trim() &&
                    (shop.fields.rider_providers ?? PROVIDERS).map((provider) => (
                      <Stack key={provider} direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                        <Button
                          variant="outlined"
                          href={riderLink(provider, pickup, drop)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {PROVIDER_NAMES[provider]}
                          {provider !== 'uber' ? ` · ${t.openHome}` : ''}
                        </Button>
                        {provider === 'uber' && (
                          <Button
                            href={PROVIDER_HOME[provider]}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t.openHome}
                          </Button>
                        )}
                      </Stack>
                    ))}
                </>
              )}
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  )
}
