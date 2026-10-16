import type { ReactNode } from 'react'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { Copy, ExternalLink, Info, MapPinned } from 'lucide-react'
import { shape } from '../../design/theme'
import { weekdays } from '../shop/hoursModel'
import { useShopCopy } from '../shop/strings'
import { useLocale } from '../../state/hooks'
import type { Business, Product } from './api'
import { formatPrice } from './format'
import { useInChatCopy } from './inChatCopy'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'

/**
 * Google's own "search" Maps URL (developers.google.com/maps/documentation/urls). With
 * coordinates it opens Google Maps with a pin at exactly that point, where the owner taps
 * "Add a missing place". Google offers no URL that prefills a new place's name or category,
 * so those go through the clipboard.
 */
function mapsAtPin(fields: Business['fields']) {
  const query =
    fields.lat != null && fields.lng != null
      ? `${fields.lat.toFixed(6)},${fields.lng.toFixed(6)}`
      : [fields.name, fields.location].filter(Boolean).join(' ')
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query)
}

/** The shop as the owner pastes it into Google's form. */
function placeDetails(
  fields: Business['fields'],
  products: Product[],
  t: ReturnType<typeof useCopy>,
  closed: string,
  locale: string,
) {
  const weekly = (fields.weekly_hours ?? [])
    .map((entry) => {
      const day = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2026, 0, 5 + weekdays.indexOf(entry.day))),
      )
      return `${day} ${entry.closed ? closed : `${entry.open}–${entry.close}`}`
    })
    .join(', ')
  return [
    fields.name,
    fields.category && `${t.fields.category}: ${fields.category}`,
    fields.location && `${t.fields.location}: ${fields.location}`,
    weekly && `${t.fields.hours}: ${weekly}`,
    fields.hours && `${t.fields.hours}: ${fields.hours}`,
    fields.phone && `${t.fields.phone}: ${fields.phone}`,
    fields.lat != null &&
      fields.lng != null &&
      `${fields.lat.toFixed(6)}, ${fields.lng.toFixed(6)}`,
    products.length > 0 &&
      `${t.products}: ` +
        products
          .slice(0, 12)
          .map((p) => `${p.name} ${formatPrice(p.price, fields.currency ?? 'SGD')}`)
          .join(', '),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * The safe Google Maps hand-off: copy the details, open Google Maps at the pin, the owner adds
 * the place and submits it on Google. It never says the shop is on Google.
 */
export function MapsHandoff({
  fields,
  products,
}: {
  fields: Business['fields']
  products: Product[]
}) {
  const t = useCopy()
  const c = useInChatCopy()
  const ws = useWorkspace()
  const shopCopy = useShopCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const pinned = fields.lat != null && fields.lng != null
  function copy() {
    void navigator.clipboard
      .writeText(placeDetails(fields, products, t, shopCopy.closed, locale))
      .then(() => ws.notify(t.copied))
      .catch(() => ws.notify(t.actionFailed))
  }
  const step = (n: number, text: string, action: ReactNode) => (
    <Box component="li" sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      <Box
        aria-hidden="true"
        sx={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: roles.primaryContainer,
          color: roles.onPrimaryContainer,
          typography: 'labelLarge',
        }}
      >
        {n}
      </Box>
      <Stack spacing={1} sx={{ minWidth: 0, pt: 0.25, alignItems: 'flex-start' }}>
        <Typography variant="bodyMedium">{text}</Typography>
        {action}
      </Stack>
    </Box>
  )
  return (
    <Box
      component="section"
      aria-labelledby="maps-handoff-title"
      data-testid="maps-handoff"
      sx={{
        p: 3,
        borderRadius: `${shape.lg}px`,
        bgcolor: roles.surfaceContainer,
        textAlign: 'start',
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <MapPinned size={22} aria-hidden="true" color={roles.primary} />
        <Typography id="maps-handoff-title" component="h2" variant="titleMedium">
          {c.gmTitle}
        </Typography>
      </Stack>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
        {c.gmBody}
      </Typography>
      <Stack component="ol" spacing={2} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2.5 }}>
        {step(
          1,
          c.gmStepCopy,
          <Button variant="outlined" startIcon={<Copy size={18} />} onClick={copy}>
            {c.gmCopy}
          </Button>,
        )}
        {step(
          2,
          pinned ? c.gmStepOpen : c.gmNoPin,
          <Button
            variant="contained"
            startIcon={<ExternalLink size={18} />}
            href={mapsAtPin(fields)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c.gmOpen}
          </Button>,
        )}
        {step(3, c.gmStepAdd, null)}
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 2.5, alignItems: 'flex-start', color: 'text.secondary' }}
      >
        <Info size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <Typography variant="bodySmall" data-testid="maps-handoff-status">
          {c.gmStatus}
        </Typography>
      </Stack>
    </Box>
  )
}
