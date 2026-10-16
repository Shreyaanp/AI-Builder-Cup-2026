import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { LocateFixed, MapPin } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import type { Business, Proposal } from './api'
import { useCopy } from './strings'
import { useNewShopCopy } from './newShopCopy'
import { useInChatCopy } from './inChatCopy'
import { useWorkspace } from './workspaceContext'
import { readablePlace, useMeasureLocation, type OwnerLocation } from './location'

export type { OwnerLocation }

/** A single explicit measurement, with its reason shown before the request. */
export function CurrentLocationAction({
  onLocation,
  disabled = false,
}: {
  onLocation: (point: OwnerLocation, signal: AbortSignal) => Promise<void>
  disabled?: boolean
}) {
  const t = useCopy()
  const { locate, busy, error } = useMeasureLocation(onLocation)
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
  const f = useNewShopCopy()
  const c = useInChatCopy()
  const locale = useLocale()
  if (fields.lat == null || fields.lng == null) return null
  const readable = readablePlace(fields, f)
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: 'flex-start', overflowWrap: 'anywhere' }}
    >
      <MapPin size={24} aria-hidden="true" style={{ flexShrink: 0 }} />
      <Box>
        <Typography variant="titleSmall">
          {fields.pin_source === 'device'
            ? t.yourLocation
            : fields.pin_source === 'pin'
              ? c.pinPlaced
              : t.fields.location}
        </Typography>
        <Typography variant="bodyMedium">{readable}</Typography>
        {fields.pin_source === 'device' && fields.pin_accuracy_m != null && (
          <Typography variant="bodyMedium" color="text.secondary">
            {t.locationAccuracy(
              new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
                Math.ceil(fields.pin_accuracy_m),
              ),
            )}
          </Typography>
        )}
        <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
          {fields.lat.toFixed(5)}, {fields.lng.toFixed(5)}
        </Typography>
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
