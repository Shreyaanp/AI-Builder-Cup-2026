import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { LocateFixed, MapPin } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import type { Business, Proposal } from './api'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'

export type OwnerLocation = { lat: number; lng: number; accuracy_m: number }

/** A single explicit measurement. Late callbacks cannot change a closed shop or draft. */
export function CurrentLocationAction({
  onLocation,
  disabled = false,
}: {
  onLocation: (point: OwnerLocation, signal: AbortSignal) => Promise<void>
  disabled?: boolean
}) {
  const t = useCopy()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(false)
  const pending = useRef(false)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      operation.current?.abort()
    }
  }, [])
  async function locate() {
    if (pending.current || disabled) return
    setError('')
    if (!navigator.geolocation) {
      setError(t.locationFailed)
      return
    }
    pending.current = true
    const abort = new AbortController()
    operation.current = abort
    setBusy(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 0,
        }),
      )
      if (!alive.current) return
      const { latitude: lat, longitude: lng, accuracy: accuracy_m } = position.coords
      if (![lat, lng, accuracy_m].every(Number.isFinite) || accuracy_m < 0)
        throw new Error('INVALID_LOCATION')
      await onLocation({ lat, lng, accuracy_m }, abort.signal)
    } catch (cause) {
      if (alive.current)
        setError(
          cause && typeof cause === 'object' && 'code' in cause && cause.code === 1
            ? t.locationDenied
            : t.locationFailed,
        )
    } finally {
      pending.current = false
      if (alive.current) setBusy(false)
    }
  }
  return (
    <Stack spacing={1}>
      <Typography variant="bodyMedium" color="text.secondary">
        {t.locationReason}
      </Typography>
      <Button
        variant="outlined"
        startIcon={busy ? <CircularProgress size={18} /> : <LocateFixed size={20} />}
        disabled={disabled || busy}
        onClick={() => void locate()}
      >
        {busy ? t.locating : t.useCurrentLocation}
      </Button>
      {error && <Alert severity="info">{error}</Alert>}
    </Stack>
  )
}

export function LocationPin({ fields }: { fields: Business['fields'] }) {
  const t = useCopy()
  const locale = useLocale()
  if (fields.lat == null || fields.lng == null) return null
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: 'flex-start', overflowWrap: 'anywhere' }}
    >
      <MapPin size={24} aria-hidden="true" style={{ flexShrink: 0 }} />
      <Box>
        <Typography variant="titleSmall">
          {fields.pin_source === 'device' ? t.yourLocation : t.fields.location}
        </Typography>
        <Typography variant="bodyMedium">
          {fields.pin_label || `${fields.lat.toFixed(5)}, ${fields.lng.toFixed(5)}`}
        </Typography>
        {fields.pin_source === 'device' && fields.pin_accuracy_m != null && (
          <Typography variant="bodyMedium" color="text.secondary">
            {t.locationAccuracy(
              new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
                Math.ceil(fields.pin_accuracy_m),
              ),
            )}
          </Typography>
        )}
      </Box>
    </Stack>
  )
}

export function ShopLocation({ onReviewed }: { onReviewed: () => void }) {
  const ws = useWorkspace()
  const shop = ws.active
  if (!shop) return null
  return (
    <Stack spacing={2}>
      <CurrentLocationAction
        onLocation={async (owner_location, signal) => {
          const proposal = await ws.api<Proposal>('/proposals', {
            method: 'POST',
            signal,
            body: JSON.stringify({
              kind: 'business',
              business_id: shop.id,
              revision: shop.revision,
              business: shop.fields,
              owner_location,
            }),
          })
          signal.throwIfAborted()
          onReviewed()
          ws.review(proposal)
        }}
      />
      <LocationPin fields={shop.fields} />
    </Stack>
  )
}
