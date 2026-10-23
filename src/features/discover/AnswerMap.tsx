import { useMemo, useState } from 'react'
import { Box, Button, Stack } from '@mui/material'
import { Maximize2 } from 'lucide-react'
import type { Locale } from '../../i18n/locales'
import type { AskAnswer, AskPick } from './askThread'
import { conversationCopy } from './conversationCopy'
import { mapCopy } from './mapCopy'
import { MapExplorer, type ExplorerPlace } from './MapExplorer'
import { MapLegend, ResultsMap } from './ResultsMap'
import { mapsLink } from './types'

/** Which place is highlighted, and whether a pin or a card asked for it. */
export type MapSelection = { id: string; from: 'pin' | 'card' } | null

/** Every place in the answer as a map row: our shops numbered like their cards, then Google's. */
function answerPlaces(answer: AskAnswer, ours: AskPick[]): ExplorerPlace[] {
  const rows: ExplorerPlace[] = ours.map((pick, index) => {
    const item = pick.matched[0] ?? pick.items.find((i) => i.available)
    return {
      id: pick.id,
      name: pick.name,
      kind: 'ours',
      lat: pick.lat,
      lng: pick.lng,
      open: pick.open_now,
      label: String(index + 1),
      distance_m: pick.distance_m,
      item: item && pick.currency ? { ...item, currency: pick.currency } : null,
      href: `/explore/s/${pick.id}`,
    }
  })
  const seen = new Set(rows.map((r) => r.id))
  const google = answer.groups
    .filter((g) => g.id === 'open' || g.id === 'more')
    .flatMap((g) => g.places)
  for (const place of answer.area?.places ?? []) {
    if (seen.has(place.id)) continue
    seen.add(place.id)
    rows.push({
      id: place.id,
      name: place.name,
      kind: 'google',
      lat: place.lat,
      lng: place.lng,
      open: place.open_now ?? null,
      distance_m: place.distance_m,
      rating: place.rating,
      href: mapsLink(place.google_maps_uri),
    })
  }
  for (const place of google) {
    if (seen.has(place.id)) continue
    seen.add(place.id)
    rows.push({
      id: place.id,
      name: place.name,
      kind: 'google',
      lat: place.lat,
      lng: place.lng,
      open: place.open_now,
      distance_m: place.distance_m,
      rating: place.rating,
      href: mapsLink(place.google_maps_uri),
    })
  }
  return rows
}

/**
 * The answer's places on a map, inside the conversation. Tapping one of our pins lights up its
 * card; a Google pin, or "Open map", opens the full-screen map with the results sheet.
 */
export function AnswerMap({
  answer,
  ours,
  center,
  locale,
  selected,
  onSelect,
}: {
  answer: AskAnswer
  ours: AskPick[]
  center: { lat: number; lng: number }
  locale: Locale
  selected: MapSelection
  onSelect: (selection: MapSelection) => void
}) {
  const copy = mapCopy(locale)
  const places = useMemo(() => answerPlaces(answer, ours), [answer, ours])
  const [explorer, setExplorer] = useState<{ open: boolean; initial: string | null }>({
    open: false,
    initial: null,
  })
  if (places.length === 0) return null
  return (
    <Box sx={{ mt: 4, position: 'relative' }}>
      <ResultsMap
        pins={places}
        center={center}
        anchor={answer.anchor}
        selected={selected?.id ?? null}
        onSelect={(id) => {
          const place = places.find((p) => p.id === id)
          if (place?.kind === 'ours') {
            onSelect({ id, from: 'pin' })
            document
              .getElementById(`pick-${id}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
          } else setExplorer({ open: true, initial: id })
        }}
        copy={{ ...copy, title: conversationCopy(locale).map }}
        variant="inline"
        // A strip on phones, so the rows below start in the first screen.
        height={{ xs: 160, md: 220 }}
      />
      {/* Under the map, beside the legend: it never covers a pin. */}
      <Stack
        direction="row"
        sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
      >
        <MapLegend copy={copy} />
        <Button
          variant="outlined"
          onClick={() => setExplorer({ open: true, initial: selected?.id ?? null })}
          startIcon={<Maximize2 size={16} aria-hidden="true" />}
          sx={{ minHeight: 48, borderRadius: 999, flexShrink: 0 }}
        >
          {copy.openMap}
        </Button>
      </Stack>
      {explorer.open && (
        <MapExplorer
          open
          onClose={() => setExplorer({ open: false, initial: null })}
          places={places}
          center={center}
          anchor={answer.anchor}
          copy={copy}
          locale={locale}
          initial={explorer.initial}
        />
      )}
    </Box>
  )
}
