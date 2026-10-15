import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { Check, X } from 'lucide-react'
import { shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { useRewardCopy } from './strings'
import { celebrations, claimReward, useRewards, visit } from './storage'
import { useCopy } from '../v1/strings'
import { useCustomer } from '../customer/account'
import { setPassport, usePassport } from '../passport/store'
import type { PassportView } from '../passport/store'

export function StampCard({
  shop,
  name,
  timezone,
  reward,
  needed = 8,
}: {
  shop: string
  name: string
  timezone: string
  reward?: string
  needed?: number
}) {
  const { data, unavailable } = useRewards()
  const t = useRewardCopy()
  const common = useCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const [redeeming, setRedeeming] = useState(false)
  const [failedClaim, setFailedClaim] = useState(false)
  const target = Number.isInteger(needed) && needed >= 3 && needed <= 20 ? needed : 8
  useEffect(() => {
    visit(shop, new URLSearchParams(location.search).get('source') === 'qr', timezone, target)
  }, [shop, timezone, target])
  useEffect(() => {
    if (!redeeming) return
    const back = () => setRedeeming(false)
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [redeeming])
  // Signed in: the server's card (verified visits); signed out: this phone's card.
  const account = useCustomer()
  const { view } = usePassport(null)
  const server =
    account.status === 'signed-in' ? view?.shops.find((card) => card.id === shop) : undefined
  const signedIn = account.status === 'signed-in'
  const count = Math.min(signedIn ? (server?.card ?? 0) : (data.shops[shop]?.stamps ?? 0), target)
  const claimed = signedIn ? (server?.claimed ?? 0) : (data.shops[shop]?.claimed ?? 0)
  const full = count >= target
  const number = (value: number) => new Intl.NumberFormat(locale).format(value)
  const close = () => {
    setRedeeming(false)
    if ((history.state as { rewardRedeem?: string } | null)?.rewardRedeem === shop) history.back()
  }
  return (
    <Box
      component="section"
      aria-label={t.stampCard}
      sx={{
        mt: 3,
        p: 4,
        borderRadius: `${shape.lg}px`,
        bgcolor: roles.surfaceContainer,
        color: roles.onSurface,
        border: `1px solid ${roles.outlineVariant}`,
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
            '100%': { transform: 'scale(1)', opacity: 1 },
          },
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      >
        {celebrations.has(shop) && [5, 10].includes(count)
          ? t.milestone.replace('{count}', number(count))
          : t.stamps.replace('{count}', number(count))}
      </Typography>
      <Stack
        direction="row"
        role="img"
        aria-label={t.progress.replace('{count}', number(count)).replace('{total}', number(target))}
        sx={{ flexWrap: 'wrap', gap: 2, my: 3 }}
      >
        {Array.from({ length: target }, (_, index) => (
          <Box
            key={index}
            component="span"
            aria-hidden="true"
            data-filled={index < count}
            sx={{
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: `1px solid ${roles.outline}`,
              bgcolor: index < count ? roles.primary : roles.surface,
              color: index < count ? roles.onPrimary : roles.onSurfaceVariant,
              typography: 'labelMedium',
            }}
          >
            {index < count ? <Check size={18} /> : number(index + 1)}
          </Box>
        ))}
      </Stack>
      <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
        {reward
          ? full
            ? reward
            : t.more.replace('{count}', number(target - count)).replace('{reward}', reward)
          : t.noReward}
      </Typography>
      {/* One short line; the full "not proof of purchase" note is on the claim screen. */}
      <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
        {t.qr} {signedIn ? t.account : t.phone}
      </Typography>
      {claimed > 0 && (
        <Typography variant="labelLarge" component="p" sx={{ mt: 2 }}>
          {claimed === 1 ? t.claimedOne : t.claimedMany.replace('{count}', number(claimed))}
        </Typography>
      )}
      {full && reward && (
        <Button
          variant="contained"
          fullWidth
          sx={{ mt: 3 }}
          disabled={unavailable}
          onClick={() => {
            history.pushState({ ...(history.state as object | null), rewardRedeem: shop }, '')
            setFailedClaim(false)
            setRedeeming(true)
          }}
        >
          {t.claim}
        </Button>
      )}
      {unavailable && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {t.storage}
        </Alert>
      )}
      <Dialog
        open={redeeming && full}
        fullScreen
        onClose={close}
        aria-labelledby="reward-redeem-title"
        sx={{
          '& .MuiDialog-paper': { borderRadius: 0, bgcolor: roles.surface, color: roles.onSurface },
        }}
      >
        <IconButton
          aria-label={common.close}
          onClick={close}
          sx={{
            alignSelf: 'flex-end',
            mr: 'max(8px, env(safe-area-inset-right))',
            mt: 'max(8px, env(safe-area-inset-top))',
          }}
        >
          <X size={24} />
        </IconButton>
        <DialogContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            maxWidth: 520,
            width: '100%',
            mx: 'auto',
            p: 6,
            pb: 'max(24px, env(safe-area-inset-bottom))',
            overflowWrap: 'anywhere',
          }}
        >
          <Stack spacing={5} sx={{ textAlign: 'center' }}>
            <Typography component="h1" id="reward-redeem-title" variant="headlineMedium">
              {name}
            </Typography>
            <Typography variant="headlineSmall">{reward}</Typography>
            <Typography variant="bodyLarge">{t.show}</Typography>
            {redeeming && <LiveClock timezone={timezone} />}
            <Typography variant="bodySmall" color="text.secondary">
              {signedIn ? `${t.account} ${t.accountHonesty}` : `${t.phone} ${t.honesty}`}
            </Typography>
            {failedClaim && <Alert severity="warning">{t.storage}</Alert>}
            <Button
              variant="contained"
              onClick={() => {
                if (!signedIn) {
                  if (claimReward(shop, target)) close()
                  else setFailedClaim(true)
                  return
                }
                account
                  .api<PassportView>(
                    `/api/v1/customer/passport/shops/${encodeURIComponent(shop)}/claim`,
                    { method: 'POST' },
                  )
                  .then((next) => {
                    setPassport(next)
                    close()
                  })
                  .catch(() => setFailedClaim(true))
              }}
            >
              {t.markUsed}
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}

function LiveClock({ timezone }: { timezone: string }) {
  const locale = useLocale()
  const t = useRewardCopy()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <Box>
      <Typography variant="bodySmall">{t.liveClock}</Typography>
      <Typography
        component="time"
        dateTime={now.toISOString()}
        variant="displaySmall"
        sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}
      >
        {new Intl.DateTimeFormat(locale, {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }).format(now)}
      </Typography>
      <Typography variant="bodyLarge">
        {new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: 'full' }).format(now)}
      </Typography>
    </Box>
  )
}
