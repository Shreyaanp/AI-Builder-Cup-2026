import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material'
import { Bell, Award, Check } from 'lucide-react'
import { shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { useRewardCopy } from './strings'
import { celebrations, deviceId, remind, useRewards, visit } from './storage'

export function BadgeRow({ shop }: { shop?: string }) {
  const { data } = useRewards()
  const t = useRewardCopy()
  const locale = useLocale()
  const count = shop ? (data.shops[shop]?.stamps ?? 0) : 0
  const badges = [
    ...(data.streak ? [t.streak] : []),
    ...(Object.keys(data.shops).length >= 5 ? [t.tried] : []),
    ...(data.early ? [t.early] : []),
    ...[5, 10]
      .filter((n) => count >= n)
      .map((n) => t.stamps.replace('{count}', new Intl.NumberFormat(locale).format(n))),
  ]
  if (!badges.length) return null
  return (
    <Stack
      component="ul"
      aria-label={t.badges}
      direction="row"
      sx={{ flexWrap: 'wrap', gap: 1, p: 0, my: 2, listStyle: 'none' }}
    >
      {badges.map((label) => (
        <Box component="li" key={label}>
          <Chip
            icon={<Award size={16} aria-hidden="true" />}
            label={label}
            title={label === t.early ? t.earlyHelp : undefined}
          />
        </Box>
      ))}
    </Stack>
  )
}

export function StampCard({
  shop,
  timezone,
  reward,
}: {
  shop: string
  timezone: string
  reward?: string
}) {
  const { data, unavailable } = useRewards()
  const t = useRewardCopy()
  const locale = useLocale()
  const roles = useTheme().material
  useEffect(() => {
    visit(shop, new URLSearchParams(location.search).get('source') === 'qr', timezone)
  }, [shop, timezone])
  const count = data.shops[shop]?.stamps ?? 0
  const number = new Intl.NumberFormat(locale).format(count)
  return (
    <Box
      component="section"
      aria-label={t.stampCard}
      sx={{
        mt: 3,
        p: 2,
        borderRadius: `${shape.lg}px`,
        bgcolor: roles.secondaryContainer,
        color: roles.onSecondaryContainer,
      }}
    >
      <Typography component="h2" variant="titleMedium">
        {t.stampCard}
      </Typography>
      <Typography
        component="p"
        variant="headlineSmall"
        role="status"
        sx={{
          fontVariantNumeric: 'tabular-nums',
          animation: celebrations.has(shop) ? 'stampCelebrate 700ms ease-out' : undefined,
          '@keyframes stampCelebrate': {
            '0%': { transform: 'scale(.95)', opacity: 0.5 },
            '50%': { transform: 'scale(1.05)', opacity: 1 },
            '100%': { transform: 'scale(1)', opacity: 1 },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        {celebrations.has(shop) && [5, 10].includes(count)
          ? t.milestone.replace('{count}', number)
          : t.stamps.replace('{count}', number)}
      </Typography>
      <Stack direction="row" aria-hidden="true" sx={{ flexWrap: 'wrap', gap: 1, my: 1 }}>
        {Array.from({ length: 10 }, (_, index) => (
          <Box
            key={index}
            component="span"
            sx={{
              width: 24,
              height: 24,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              bgcolor: index < count ? roles.primary : roles.surfaceContainerHigh,
              color: index < count ? roles.onPrimary : roles.onSurfaceVariant,
              typography: 'labelSmall',
            }}
          >
            {index < count ? <Check size={16} /> : new Intl.NumberFormat(locale).format(index + 1)}
          </Box>
        ))}
      </Stack>
      <Typography variant="bodySmall">{t.qr}</Typography>
      {reward && (
        <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
          {reward}
        </Typography>
      )}
      <Typography variant="labelLarge" sx={{ mt: 1 }}>
        {t.show}
      </Typography>
      <Typography variant="bodySmall">{t.local}</Typography>
      {unavailable && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          {t.storage}
        </Alert>
      )}
    </Box>
  )
}

export function StockReminder({ shop, name, unit }: { shop: string; name: string; unit: string }) {
  const t = useRewardCopy()
  const { data } = useRewards()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const saved = data.reminders.some((r) => r.shop === shop && r.name === name && r.unit === unit)
  async function subscribe() {
    if (busy || saved) return
    setBusy(true)
    setError(false)
    const expires = Date.now() + 7 * 86_400_000
    if (!remind(shop, name, unit, expires)) {
      setError(true)
      setBusy(false)
      return
    }
    try {
      const response = await fetch(
        `/api/v1/public/shops/${encodeURIComponent(shop)}/stock-alerts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({ device_id: deviceId(), name, unit }),
        },
      )
      if (response.ok) {
        const receipt = (await response.json()) as { expires: number }
        remind(shop, name, unit, receipt.expires * 1000)
      }
      // Local menu comparison is sufficient if the server is unreachable or rate limited.
    } catch {
      /* The next-visit reminder already lives on-device. */
    } finally {
      setBusy(false)
    }
  }
  return (
    <Stack sx={{ alignItems: 'flex-start', mt: 1 }}>
      <Button
        startIcon={<Bell size={18} aria-hidden="true" />}
        variant="text"
        disabled={busy || saved}
        onClick={() => void subscribe()}
        sx={{ minHeight: 48, textAlign: 'start' }}
      >
        {saved ? t.saved : t.tell}
      </Button>
      {saved && (
        <Typography variant="bodySmall" role="status">
          {t.reminder}
        </Typography>
      )}
      {error && <Alert severity="warning">{t.storage}</Alert>}
    </Stack>
  )
}

export function BackInStock({
  shop,
  products,
}: {
  shop: string
  products: { name: string; unit: string; available: boolean }[]
}) {
  const t = useRewardCopy()
  const { data } = useRewards()
  const ready = data.reminders.filter(
    (r) =>
      r.shop === shop &&
      products.some((p) => p.name === r.name && p.unit === r.unit && p.available),
  )
  return (
    <Stack spacing={1} sx={{ mt: ready.length ? 2 : 0 }}>
      {ready.map((r) => (
        <Alert severity="success" key={r.name + r.unit}>
          {t.back.replace('{item}', r.name)}
        </Alert>
      ))}
    </Stack>
  )
}
