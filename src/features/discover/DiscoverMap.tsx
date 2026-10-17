import { useMemo, useState } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { ExternalLink } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { customerNavigate } from '../frontdoors/navigation'
import { askCopy } from './askStrings'
import { mapCopy } from './mapCopy'
import { MapLegend, ResultsMap, type MapPin } from './ResultsMap'
import type { Place } from './types'

/**
 * Browse "Map view": the same results map as the conversation (a real Google map in live mode,
 * the chalk street sketch with numbered pins otherwise), so it is never a blank grid. Tap a pin
 * to see the place under the map; the list below remains the accessible alternative.
 */
export default function DiscoverMap({
  places,
  center,
  demo,
  onOpen,
  demoLabel,
}: {
  places: Place[]
  center: { lat: number; lng: number }
  demo: boolean
  onOpen: (place: Place) => void
  unavailable: string
  loading: string
  demoLabel: string
}) {
  const locale = useLocale()
  const copy = mapCopy(locale)
  const ask = askCopy(locale)
  const [selected, setSelected] = useState<string | null>(null)
  const pins = useMemo<MapPin[]>(() => {
    let n = 0
    return places.map((place) => ({
      id: place.id,
      name: place.name,
      kind: place.source === 'chalkboard' ? 'ours' : 'google',
      lat: place.lat,
      lng: place.lng,
      open: place.open_now,
      label: place.source === 'chalkboard' ? String(++n) : undefined,
    }))
  }, [places])
  const chosen = places.find((place) => place.id === selected)
  return (
    <Box>
      {demo && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {demoLabel}
        </Alert>
      )}
      <Box>
        <ResultsMap
          height={{ xs: 320, md: 420 }}
          pins={pins}
          center={center}
          selected={selected}
          onSelect={setSelected}
          copy={copy}
          variant="inline"
        />
      </Box>
      <Box sx={{ mt: 2 }}>
        <MapLegend copy={copy} />
      </Box>
      {chosen && (
        <Stack
          direction="row"
          role="status"
          className="c-rise"
          sx={{
            mt: 3,
            p: 3,
            gap: 3,
            alignItems: 'center',
            borderRadius: '16px',
            bgcolor: 'action.selected',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="titleSmall" noWrap>
              {chosen.name}
            </Typography>
            {chosen.open_now !== null && (
              <Typography variant="bodySmall" color="text.secondary">
                {chosen.open_now ? ask.openNow : ask.closed}
              </Typography>
            )}
          </Box>
          {chosen.source === 'chalkboard' ? (
            <Button
              component="a"
              href={`/explore/s/${encodeURIComponent(chosen.id)}`}
              onClick={customerNavigate}
              variant="contained"
              sx={{ minHeight: 48 }}
            >
              {copy.openShop}
            </Button>
          ) : (
            <Button
              variant="outlined"
              onClick={() => onOpen(chosen)}
              endIcon={<ExternalLink size={16} aria-hidden="true" />}
              sx={{ minHeight: 48 }}
            >
              {copy.openGoogle}
            </Button>
          )}
        </Stack>
      )}
    </Box>
  )
}
