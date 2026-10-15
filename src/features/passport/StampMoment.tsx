import { useEffect, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Dialog, Stack, Typography, useTheme } from '@mui/material'
import { gsap } from 'gsap'
import { Clock, MapPinOff, QrCode, Store, TriangleAlert } from 'lucide-react'
import { useChalkTimeline } from '../../design/chalkMotion'
import { HAND_FONT } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { useCustomer } from '../customer/account'
import { SignInSheet } from '../customer/SignIn'
import { Sticker } from './art'
import { fill, requirementText, usePassportCopy } from './copy'
import { keepReceipt, receipts, setPassport } from './store'
import type { Outcome, StampResult } from './store'
import { SetComplete } from './games/CollectionSets'
import { useGamesCopy } from './games/copy'
import { ScratchCard } from './games/ScratchCard'

type Phase =
  | { step: 'locating' }
  | { step: 'sending' }
  | { step: 'result'; outcome: Outcome; result: StampResult }
  | { step: 'bad-key' }
  | { step: 'failed' }

function locate(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 15_000,
    })
  })
}

/**
 * The stamp moment: opened by a shop's QR (or a demo shop's on-screen QR). Checks the phone is
 * at the shop, stamps, then one celebration of at most 1.2 s that a tap skips. Under reduced
 * motion the timeline never runs and the final state shows at once.
 */
export function StampMoment({
  shop,
  qrKey,
  open,
  onClose,
}: {
  shop: { id: string; name: string; category?: string; demo?: boolean }
  qrKey: string
  open: boolean
  onClose: () => void
}) {
  const t = usePassportCopy()
  const account = useCustomer()
  const roles = useTheme().material
  const [phase, setPhase] = useState<Phase>({ step: 'locating' })
  const [attempt, setAttempt] = useState(0)
  const [signIn, setSignIn] = useState(false)
  const signedIn = account.status === 'signed-in'

  useEffect(() => {
    if (!open || account.status === 'loading') return
    let live = true
    async function run() {
      setPhase({ step: 'locating' })
      const position = await locate()
      if (!live) return
      setPhase({ step: 'sending' })
      const body = JSON.stringify({
        shop_id: shop.id,
        key: qrKey,
        ...(position && {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        }),
        // Signed out, the server judges the scan against this phone's earlier stamps.
        ...(!signedIn && { receipts: receipts() }),
      })
      const path = signedIn ? '/api/v1/customer/passport/stamps' : '/api/v1/public/passport/check'
      try {
        const response = await account.raw(path, { method: 'POST', body })
        if (!live) return
        if (response.status === 403) return setPhase({ step: 'bad-key' })
        if (!response.ok) throw new Error(String(response.status))
        const result = (await response.json()) as StampResult
        if (result.passport) setPassport(result.passport)
        if (result.receipt) keepReceipt(result.receipt)
        if (result.outcome.verdict === 'stamped') navigator.vibrate?.(30)
        setPhase({ step: 'result', outcome: result.outcome, result })
      } catch {
        if (live) setPhase({ step: 'failed' })
      }
    }
    void run()
    return () => {
      live = false
    }
    // The account object changes identity on unread refreshes; the stamp must run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt, account.status, shop.id, qrKey, signedIn])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="stamp-moment-title"
      aria-describedby="stamp-moment-body"
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: '28px',
          bgcolor: roles.surfaceContainerLow,
          m: 2,
          width: 'calc(100% - 32px)',
          overflowY: 'auto',
        },
      }}
    >
      <Box sx={{ p: 5, pt: 6, textAlign: 'center' }} aria-live="polite">
        {phase.step === 'locating' || phase.step === 'sending' ? (
          <Stack spacing={3} sx={{ alignItems: 'center', py: 4 }}>
            <CircularProgress aria-hidden="true" />
            <Typography id="stamp-moment-title" variant="titleMedium">
              {t.checking}
            </Typography>
            <Typography id="stamp-moment-body" variant="bodyMedium" color="text.secondary">
              {shop.name}
            </Typography>
          </Stack>
        ) : phase.step === 'result' && phase.outcome.verdict === 'stamped' ? (
          <>
            <Celebration
              shop={shop}
              outcome={phase.outcome}
              result={phase.result}
              signedIn={signedIn}
            />
            {/* The variable reward: a scratch card for this verified stamp. */}
            {phase.result.scratch && (
              <Box sx={{ mt: 4, textAlign: 'start' }}>
                <ScratchCard card={phase.result.scratch} />
              </Box>
            )}
          </>
        ) : (
          <Problem phase={phase} />
        )}
        <Stack spacing={2} sx={{ mt: 4 }}>
          {phase.step === 'failed' && (
            <Button variant="contained" onClick={() => setAttempt((n) => n + 1)}>
              {t.retry}
            </Button>
          )}
          {!signedIn && phase.step === 'result' && (
            <Button variant="outlined" onClick={() => setSignIn(true)}>
              {t.signIn}
            </Button>
          )}
          <Button
            variant={phase.step === 'result' ? 'contained' : 'text'}
            onClick={onClose}
            autoFocus
          >
            {t.done}
          </Button>
        </Stack>
      </Box>
      <SignInSheet
        open={signIn}
        onClose={() => setSignIn(false)}
        onSignedIn={() => setSignIn(false)}
        body={t.signInKeep}
      />
    </Dialog>
  )
}

function Problem({ phase }: { phase: Phase }) {
  const t = usePassportCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const verdict = phase.step === 'result' ? phase.outcome.verdict : phase.step
  const distance =
    phase.step === 'result' && phase.outcome.distance_m != null
      ? new Intl.NumberFormat(locale, {
          style: 'unit',
          unit: phase.outcome.distance_m < 1000 ? 'meter' : 'kilometer',
          maximumFractionDigits: 1,
        }).format(
          phase.outcome.distance_m < 1000
            ? Math.round(phase.outcome.distance_m / 10) * 10
            : phase.outcome.distance_m / 1000,
        )
      : ''
  const copy: Record<string, [string, string, typeof Store]> = {
    too_far: [t.tooFar, fill(t.tooFarBody, { distance }), MapPinOff],
    low_accuracy: [t.lowAccuracy, t.lowAccuracyBody, MapPinOff],
    card_only: [t.noLocation, t.noLocationBody, QrCode],
    already_today: [t.already, t.alreadyBody, Clock],
    daily_cap: [t.dailyCap, t.dailyCapBody, Clock],
    too_fast: [t.tooFast, t.tooFastBody, Clock],
    'bad-key': [t.badKey, t.badKeyBody, QrCode],
    own_shop: [t.ownShop, t.ownShopBody, Store],
    failed: [t.stampFailed, '', TriangleAlert],
  }
  const [title, body, Icon] = copy[verdict] ?? copy.failed!
  return (
    <Stack spacing={2} sx={{ alignItems: 'center' }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: roles.surfaceContainerHighest,
          color: roles.onSurfaceVariant,
        }}
      >
        <Icon size={32} />
      </Box>
      <Typography id="stamp-moment-title" component="h2" variant="titleLarge">
        {title}
      </Typography>
      {body && (
        <Typography id="stamp-moment-body" variant="bodyLarge" color="text.secondary">
          {body}
        </Typography>
      )}
    </Stack>
  )
}

function Celebration({
  shop,
  outcome,
  result,
  signedIn,
}: {
  shop: { id: string; name: string; category?: string }
  outcome: Outcome
  result: StampResult
  signedIn: boolean
}) {
  const t = usePassportCopy()
  const g = useGamesCopy()
  const locale = useLocale()
  const theme = useTheme()
  const scope = useRef<HTMLDivElement>(null)
  const points = outcome.points ?? 0
  const coop = result.passport?.games?.coop
  const number = new Intl.NumberFormat(locale).format(points)
  const levelUp = outcome.level_after !== outcome.level_before
  const next = result.passport?.level.next_requirement
  const nextLevel = result.passport?.level.next
  useChalkTimeline(
    scope,
    (root) => {
      const timeline = gsap.timeline()
      timeline
        .fromTo(
          root.querySelector('.stamp-sticker'),
          { scale: 1.9, rotate: -16, opacity: 0 },
          { scale: 1, rotate: 0, opacity: 1, duration: 0.32, ease: 'power3.in' },
        )
        .to(root.querySelector('.stamp-sticker'), {
          scale: 1,
          duration: 0.28,
          ease: 'back.out(3)',
        })
        .fromTo(
          root.querySelectorAll('.stamp-dust'),
          { x: 0, y: 0, opacity: 0.9, scale: 1 },
          {
            x: (i: number) => Math.cos((i / 10) * Math.PI * 2) * 70,
            y: (i: number) => Math.sin((i / 10) * Math.PI * 2) * 70,
            opacity: 0,
            scale: 0.4,
            duration: 0.6,
            ease: 'power2.out',
          },
          '<-0.15',
        )
        .fromTo(
          root.querySelectorAll('.stamp-line'),
          { y: 12, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.25,
            stagger: 0.08,
          },
          '<0.1',
        )
      const counter = root.querySelector('.stamp-points')
      if (counter && points > 0) {
        const value = { n: 0 }
        timeline.to(
          value,
          {
            n: points,
            duration: 0.45,
            ease: 'power1.out',
            onUpdate: () => {
              counter.textContent = fill(outcome.demo ? t.plusDemo : t.plus, {
                n: new Intl.NumberFormat(locale).format(Math.round(value.n)),
              })
            },
          },
          0.35,
        )
      }
      // A tap anywhere skips straight to the end.
      const skip = () => timeline.progress(1)
      root.addEventListener('pointerdown', skip, { once: true })
      return () => root.removeEventListener('pointerdown', skip)
    },
    [],
  )
  return (
    <Box ref={scope} sx={{ position: 'relative' }}>
      <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', height: 150 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <Box
            key={i}
            className="stamp-dust"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: theme.chalk.sunflower.main,
              opacity: 0,
            }}
          />
        ))}
        <Box className="stamp-sticker">
          <Sticker
            id={shop.id}
            category={shop.category}
            kind={outcome.first ? 'first' : 'visit'}
            size={128}
          />
        </Box>
      </Box>
      <Typography
        id="stamp-moment-title"
        component="h2"
        className="stamp-line"
        sx={{ fontFamily: HAND_FONT, fontWeight: 700, fontSize: 40, lineHeight: 1.1, mt: 1 }}
      >
        {outcome.first ? t.firstTry : t.stamped}
      </Typography>
      <Typography className="stamp-line" variant="titleMedium" sx={{ mt: 1 }}>
        {shop.name}
      </Typography>
      <Typography
        component="p"
        className="stamp-line stamp-points"
        variant="headlineSmall"
        sx={{ mt: 2, color: theme.chalk.sunflower.main, fontVariantNumeric: 'tabular-nums' }}
      >
        {fill(outcome.demo ? t.plusDemo : t.plus, { n: number })}
      </Typography>
      <Stack id="stamp-moment-body" spacing={1} sx={{ mt: 2 }}>
        {levelUp && (
          <Typography className="stamp-line" variant="titleLarge" sx={{ fontWeight: 700 }}>
            {fill(t.levelUp, { level: t[outcome.level_after ?? 'newcomer'] })}
          </Typography>
        )}
        {(outcome.quests_completed?.length ?? 0) > 0 && (
          <Typography className="stamp-line" variant="titleMedium">
            {t.questComplete}
          </Typography>
        )}
        {outcome.milestone && (
          <Typography className="stamp-line" variant="titleMedium">
            {fill(t.milestone, { n: outcome.milestone })}
          </Typography>
        )}
        {(result.sets_completed ?? []).map((id) => (
          <SetComplete key={id} set={{ id, art: '' }} />
        ))}
        {coop && coop.you > 0 && (
          <Typography className="stamp-line" variant="bodyLarge">
            {fill(g.coopHelped, {
              total: new Intl.NumberFormat(locale).format(coop.total),
              goal: new Intl.NumberFormat(locale).format(coop.goal),
            })}
          </Typography>
        )}
        {next && nextLevel && (
          <Typography className="stamp-line" variant="bodyLarge" color="text.secondary">
            {requirementText(next, nextLevel, t)}
          </Typography>
        )}
        {!signedIn && (
          <Typography className="stamp-line" variant="bodyMedium" color="text.secondary">
            {t.keptOnPhone} {g.signInScratch}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
