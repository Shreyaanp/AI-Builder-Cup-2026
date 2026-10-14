import { useState } from 'react'
import {
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from '@mui/material'
import { Search } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { discoverCopy } from './strings'

export type FoundPlace = { lat: number; lng: number; label: string }

/** Any city or neighbourhood in the world becomes the centre for discovery. */
export function PlaceSearch({
  value,
  onFound,
}: {
  value?: string
  onFound: (place: FoundPlace) => void
}) {
  const t = discoverCopy(useLocale())
  const [query, setQuery] = useState(value ?? '')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function search() {
    const q = query.trim()
    if (q.length < 2 || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const response = await fetch('/api/v1/discover/place?' + new URLSearchParams({ q }))
      if (!response.ok) throw new Error('Place not found')
      const place = (await response.json()) as FoundPlace
      setQuery(place.label)
      onFound(place)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
      <TextField
        fullWidth
        label={t.place}
        placeholder={t.placeHint}
        value={query}
        autoComplete="address-level2"
        enterKeyHint="search"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void search()
          }
        }}
        slotProps={{
          htmlInput: { maxLength: 180 },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={t.submit}
                  edge="end"
                  disabled={busy || query.trim().length < 2}
                  onClick={() => void search()}
                >
                  {busy ? <CircularProgress size={18} /> : <Search size={20} />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      {failed && (
        <Alert severity="info" role="status">
          {t.placeError}
        </Alert>
      )}
    </Stack>
  )
}
