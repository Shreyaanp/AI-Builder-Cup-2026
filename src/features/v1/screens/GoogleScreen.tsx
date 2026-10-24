import { useRef, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material'
import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  MapPin,
  MapPinned,
  Navigation,
  Pencil,
  Phone,
  Utensils,
} from 'lucide-react'
import { formatPrice, shopCurrency } from '../format'
import { useCopy } from '../strings'
import { useWorkspace } from '../workspaceContext'
import { mapsSearch, OWNER_URL } from '../../google-sim/links'
import { shape } from '../../../design/theme'
import { HoursList } from '../../shop/Hours'
import { hasHours, weekdays } from '../../shop/hoursModel'
import { useShopCopy } from '../../shop/strings'
import { useLocale } from '../../../state/hooks'
import { categoryArt } from '../../frontdoors/photos'
import { fill, useGoogleCopy } from '../../google/strings'
import { useGallery } from '../../google/useGallery'
import { GalleryEditor } from '../../google/GalleryEditor'
import { TrustCard } from '../../trust/TrustCard'

const EASE = 'cubic-bezier(0.2, 0, 0, 1)' // M3 emphasized decelerate

// Motion, defined once for the screen; the global reduced-motion rule makes these instant.
const motionKeyframes = {
  '@keyframes cbStepFromRight': {
    from: { opacity: 0, transform: 'translateX(24px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@keyframes cbStepFromLeft': {
    from: { opacity: 0, transform: 'translateX(-24px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@keyframes cbPop': {
    '0%': { transform: 'scale(0.4)', opacity: 0 },
    '70%': { transform: 'scale(1.15)', opacity: 1 },
    '100%': { transform: 'scale(1)' },
  },
  '@keyframes cbRise': {
    from: { opacity: 0, transform: 'translateY(8px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@keyframes cbPulse': {
    from: { opacity: 0.7, transform: 'scale(1)' },
    to: { opacity: 0, transform: 'scale(1.8)' },
  },
}

/** A guided, four-step path to Google: details → photos → profile preview → Google. */
export function GoogleScreen() {
  const t = useCopy()
  const g = useGoogleCopy()
  const locale = useLocale()
  const shopCopy = useShopCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const gallery = useGallery()
  const shop = ws.active
  const checksReady = Boolean(shop) && missingChecks(shop!, ws.products.length) === 0
  const [step, setStep] = useState(() =>
    !checksReady ? 0 : (shop?.gallery?.length ?? 0) === 0 ? 1 : 2,
  )
  const [direction, setDirection] = useState<1 | -1>(1)
  const heading = useRef<HTMLHeadingElement>(null)

  if (!shop)
    return (
      <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', pt: 8 }}>
        <Typography component="h1" variant="headlineMedium">
          {t.googleTitle}
        </Typography>
        <Alert severity="info">{t.googleNeedsShop}</Alert>
        <Button variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={ws.startNewShop}>
          {t.addShop}
        </Button>
      </Stack>
    )

  const f = shop.fields
  const currency = shopCurrency(shop)
  const checks = [
    { label: t.checkName, done: Boolean(f.name.trim()) },
    { label: t.checkCategory, done: Boolean(f.category.trim()) },
    { label: t.checkLocation, done: Boolean(f.location.trim()) },
    { label: t.checkHours, done: hasHours(f) },
    { label: t.checkPhone, done: Boolean(f.phone.trim()) },
    { label: t.checkProducts, done: ws.products.length > 0 },
  ]
  const detailsDone = checks.every((check) => check.done)
  const photosDone = gallery.ids.length > 0
  const doneSteps = [detailsDone, photosDone, detailsDone, false]

  function go(next: number) {
    setDirection(next > step ? 1 : -1)
    setStep(next)
    requestAnimationFrame(() => heading.current?.focus())
  }

  const weeklyHours = (f.weekly_hours ?? [])
    .map((entry) => {
      const day = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2026, 0, 5 + weekdays.indexOf(entry.day))),
      )
      const hours = entry.closed
        ? shopCopy.closed
        : `${entry.open}–${entry.close}${entry.open! > entry.close! ? ' (+1)' : ''}`
      return `${day}: ${hours}`
    })
    .join('; ')
  const listing = [
    f.name,
    f.category && `${t.fields.category}: ${f.category}`,
    f.location && `${t.fields.location}: ${f.location}`,
    weeklyHours && `${t.fields.hours}: ${weeklyHours}`,
    f.hours && `${t.fields.hours}: ${f.hours}`,
    f.phone && `${t.fields.phone}: ${f.phone}`,
    ws.products.length > 0 &&
      `${t.products}: ` +
        ws.products.map((p) => `${p.name} ${formatPrice(p.price, currency)}/${p.unit}`).join(', '),
  ]
    .filter(Boolean)
    .join('\n')

  function copyListing() {
    void navigator.clipboard
      .writeText(listing)
      .then(() => ws.notify(t.copied))
      .catch(() => ws.notify(t.actionFailed))
  }

  const titles = [g.detailsTitle, g.photosTitle, g.previewTitle, g.googleTitle]

  return (
    <Box
      component="section"
      aria-label={t.navGoogle}
      sx={{ maxWidth: 640, mx: 'auto', pt: 2, pb: 4, ...motionKeyframes }}
    >
      <Typography component="h1" variant="headlineSmall">
        {t.googleTitle}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
        {g.intro}
      </Typography>

      <StepRail
        steps={g.steps}
        names={g.steps.map((label, i) => `${fill(g.stepOf, { n: i + 1, total: 4 })}: ${label}`)}
        current={step}
        done={doneSteps}
        onPick={go}
      />

      <Box
        key={step}
        sx={{
          mt: 4,
          animation: `${direction > 0 ? 'cbStepFromRight' : 'cbStepFromLeft'} 320ms ${EASE} both`,
        }}
      >
        <Typography variant="labelLarge" color="text.secondary">
          {fill(g.stepOf, { n: step + 1, total: 4 })}
        </Typography>
        <Typography
          ref={heading}
          tabIndex={-1}
          component="h2"
          variant="titleLarge"
          sx={{ mt: 1, '&:focus': { outline: `3px solid ${roles.primary}`, outlineOffset: 4 } }}
        >
          {titles[step]}
        </Typography>

        {step === 0 && (
          <Stack spacing={3} sx={{ mt: 2 }}>
            <Tip>{g.detailsTip}</Tip>
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
              {checks.map((check, index) => (
                <Box
                  component="li"
                  key={check.label}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.5,
                    px: 3,
                    borderRadius: `${shape.md}px`,
                    bgcolor: roles.surfaceContainerLow,
                    animation: `cbRise 280ms ${EASE} both`,
                    animationDelay: `${index * 50}ms`,
                  }}
                >
                  <Box
                    aria-hidden="true"
                    sx={{
                      display: 'flex',
                      color: check.done ? roles.primary : roles.outline,
                      animation: check.done ? `cbPop 360ms ${EASE} both` : undefined,
                      animationDelay: `${120 + index * 60}ms`,
                    }}
                  >
                    {check.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                  </Box>
                  <Typography variant="bodyLarge" sx={{ flex: 1, minWidth: 0 }}>
                    {check.label}
                  </Typography>
                  <Typography variant="labelMedium" color={check.done ? 'text.secondary' : 'error'}>
                    {check.done ? t.ready : t.missing}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Button
              variant={detailsDone ? 'outlined' : 'contained'}
              startIcon={<Pencil size={18} />}
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => ws.openEditor({ kind: 'business', fields: f })}
            >
              {t.editDetails}
            </Button>
          </Stack>
        )}

        {step === 1 && <GalleryEditor gallery={gallery} />}

        {step === 2 && (
          <Stack spacing={3} sx={{ mt: 2 }}>
            <Tip>{g.previewTip}</Tip>
            <ProfilePreview
              name={f.name}
              category={f.category}
              location={f.location}
              phone={f.phone}
              hours={
                f.weekly_hours?.length ? <HoursList hours={f.weekly_hours} /> : f.hours || null
              }
              photo={gallery.urls[gallery.ids[0] ?? ''] ?? categoryArt(f.category)}
              photos={gallery.ids
                .slice(1, 4)
                .map((id) => gallery.urls[id])
                .filter((url): url is string => Boolean(url))}
              items={ws.products
                .filter((p) => p.available)
                .slice(0, 3)
                .map((p) => ({ name: p.name, price: formatPrice(p.price, currency) }))}
            />
          </Stack>
        )}

        {step === 3 && (
          <Stack spacing={4} sx={{ mt: 2 }}>
            <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 0 }}>
              <Status
                done={detailsDone}
                label={detailsDone ? g.statusDetails : g.statusDetailsTodo}
                index={0}
              />
              <Status
                done={photosDone}
                label={photosDone ? g.statusPhotos : g.statusNoPhotos}
                index={1}
              />
              <Status
                done={detailsDone}
                label={detailsDone ? g.statusProfile : g.statusProfileTodo}
                index={2}
              />
              <Status pending label={g.statusGoogle} index={3} last />
            </Box>
            <Typography variant="bodyMedium" color="text.secondary">
              {g.googleNote}
            </Typography>
            {/* Optional, before submitting to Google: customers see a verified owner. */}
            <TrustCard compact />
            <Box
              sx={{
                p: 4,
                borderRadius: `${shape.lgIncreased}px`,
                bgcolor: roles.surfaceContainerLow,
                animation: `cbRise 320ms ${EASE} 400ms both`,
              }}
            >
              <Typography component="h3" variant="titleMedium">
                {g.diyTitle}
              </Typography>
              <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
                {g.diyBody}
              </Typography>
              <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', mt: 3 }}>
                <Button variant="outlined" startIcon={<Copy size={18} />} onClick={copyListing}>
                  {t.copyListing}
                </Button>
                <Button
                  variant="contained"
                  startIcon={<ExternalLink size={18} />}
                  href={OWNER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.addOnGoogle}
                </Button>
                <Button
                  startIcon={<MapPinned size={18} />}
                  href={mapsSearch(f.name, f.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.claimOnMaps}
                </Button>
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>

      <Stack direction="row" sx={{ mt: 5, gap: 2, justifyContent: 'space-between' }}>
        <Button disabled={step === 0} onClick={() => go(step - 1)}>
          {g.back}
        </Button>
        {step < 3 && (
          <Stack direction="row" sx={{ gap: 2 }}>
            {step === 1 && !photosDone && <Button onClick={() => go(2)}>{g.skip}</Button>}
            <Button variant="contained" onClick={() => go(step + 1)}>
              {g.next}
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

function missingChecks(
  shop: { fields: { name: string; category: string; location: string; phone: string } & object },
  products: number,
): number {
  const f = shop.fields
  return [
    f.name.trim(),
    f.category.trim(),
    f.location.trim(),
    hasHours(f as Parameters<typeof hasHours>[0]),
    f.phone.trim(),
    products > 0,
  ].filter((value) => !value).length
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <Typography variant="bodyMedium" color="text.secondary">
      {children}
    </Typography>
  )
}

/** Four segments that fill as steps complete; each one jumps to its step. */
function StepRail({
  steps,
  names,
  current,
  done,
  onPick,
}: {
  steps: string[]
  names: string[]
  current: number
  done: boolean[]
  onPick: (step: number) => void
}) {
  const roles = useTheme().material
  return (
    <Box
      component="ol"
      sx={{
        m: 0,
        mt: 4,
        p: 0,
        listStyle: 'none',
        display: 'grid',
        gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        gap: 2,
      }}
    >
      {steps.map((label, index) => {
        const active = index === current
        const filled = done[index] || index < current
        return (
          <Box component="li" key={label}>
            <Box
              component="button"
              type="button"
              aria-current={active ? 'step' : undefined}
              aria-label={names[index]}
              onClick={() => onPick(index)}
              sx={{
                all: 'unset',
                cursor: 'pointer',
                display: 'block',
                width: '100%',
                minHeight: 48,
                '&:focus-visible': { outline: `3px solid ${roles.primary}`, borderRadius: 1 },
              }}
            >
              <Box
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: roles.surfaceContainerHighest,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    bgcolor: roles.primary,
                    transformOrigin: 'left',
                    transform: `scaleX(${filled ? 1 : active ? 0.5 : 0})`,
                    transition: `transform 480ms ${EASE}`,
                  }}
                />
              </Box>
              <Typography
                variant="labelMedium"
                sx={{
                  display: 'block',
                  mt: 1,
                  color: active ? roles.onSurface : roles.onSurfaceVariant,
                  fontWeight: active ? 700 : 500,
                }}
                noWrap
              >
                {label}
              </Typography>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** How the profile could look on Google, built only from the shop's own data. */
function ProfilePreview({
  name,
  category,
  location,
  phone,
  hours,
  photo,
  photos,
  items,
}: {
  name: string
  category: string
  location: string
  phone: string
  hours: ReactNode
  photo: string
  photos: string[]
  items: { name: string; price: string }[]
}) {
  const g = useGoogleCopy()
  const roles = useTheme().material
  return (
    <Box
      sx={{
        borderRadius: `${shape.lgIncreased}px`,
        overflow: 'hidden',
        bgcolor: roles.surfaceContainerLow,
        border: `1px solid ${roles.outlineVariant}`,
        animation: `cbRise 360ms ${EASE} both`,
      }}
    >
      <Box sx={{ position: 'relative' }}>
        <Box
          component="img"
          src={photo}
          alt=""
          sx={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block' }}
        />
        <Chip
          label={g.previewLabel}
          size="small"
          sx={{ position: 'absolute', top: 12, left: 12, bgcolor: roles.surface }}
        />
        {photos.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ position: 'absolute', bottom: 12, right: 12 }}>
            {photos.map((src) => (
              <Box
                key={src}
                component="img"
                src={src}
                alt=""
                sx={{
                  width: 44,
                  height: 44,
                  objectFit: 'cover',
                  borderRadius: 1,
                  border: `2px solid ${roles.surface}`,
                }}
              />
            ))}
          </Stack>
        )}
      </Box>
      <Stack spacing={2} sx={{ p: 4 }}>
        <Box>
          <Typography component="h3" variant="titleLarge">
            {name}
          </Typography>
          {category && (
            <Typography variant="bodyMedium" color="text.secondary">
              {category}
            </Typography>
          )}
        </Box>
        <Stack
          component="ul"
          aria-label={g.previewLabel}
          sx={{ m: 0, p: 0, gap: 1, listStyle: 'none' }}
        >
          {[
            { icon: <Navigation size={16} />, label: g.directions },
            ...(phone ? [{ icon: <Phone size={16} />, label: g.call }] : []),
            { icon: <Utensils size={16} />, label: g.menu },
          ].map((action) => (
            <Box
              component="li"
              key={action.label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                color: roles.onSurfaceVariant,
                typography: 'bodySmall',
                cursor: 'default',
              }}
            >
              <Box component="span" aria-hidden="true" sx={{ display: 'flex' }}>
                {action.icon}
              </Box>
              {action.label} · {g.previewLabel}
            </Box>
          ))}
        </Stack>
        {location && (
          <Row icon={<MapPin size={18} />}>
            <Typography variant="bodyMedium">{location}</Typography>
          </Row>
        )}
        {hours && <Row icon={<Check size={18} />}>{hours}</Row>}
        {phone && (
          <Row icon={<Phone size={18} />}>
            <Typography variant="bodyMedium">{phone}</Typography>
          </Row>
        )}
        {items.length > 0 && (
          <Box>
            <Typography variant="labelLarge" color="text.secondary">
              {g.popular}
            </Typography>
            <Box component="ul" sx={{ m: 0, mt: 1, p: 0, listStyle: 'none' }}>
              {items.map((item) => (
                <Box
                  component="li"
                  key={item.name}
                  sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}
                >
                  <Typography variant="bodyMedium" sx={{ minWidth: 0 }} noWrap>
                    {item.name}
                  </Typography>
                  <Typography variant="bodyMedium" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {item.price}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Stack>
    </Box>
  )
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  const roles = useTheme().material
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Box aria-hidden="true" sx={{ display: 'flex', pt: 0.25, color: roles.onSurfaceVariant }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Stack>
  )
}

/** One line of the publishing timeline; the Google step pulses while it waits. */
function Status({
  label,
  index,
  done = false,
  pending = false,
  last = false,
}: {
  label: string
  index: number
  done?: boolean
  pending?: boolean
  last?: boolean
}) {
  const roles = useTheme().material
  const color = pending ? roles.tertiary : done ? roles.primary : roles.outline
  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr',
        gap: 3,
        animation: `cbRise 280ms ${EASE} both`,
        animationDelay: `${index * 90}ms`,
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box
          aria-hidden="true"
          data-google-waiting={pending || undefined}
          sx={{
            width: 24,
            height: 24,
            mt: 0.5,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color,
            border: `2px solid ${color}`,
            bgcolor: done ? color : 'transparent',
            position: 'relative',
            ...(pending && {
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: -2,
                borderRadius: '50%',
                border: '2px solid currentColor',
                opacity: 0,
                animation: 'cbPulse 1.5s ease-out 3',
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              },
            }),
          }}
        >
          {done && <Check size={14} color={roles.onPrimary} />}
        </Box>
        {!last && <Box sx={{ width: 2, flex: 1, minHeight: 16, bgcolor: roles.outlineVariant }} />}
      </Box>
      <Typography
        variant="bodyLarge"
        sx={{ pb: last ? 0 : 3, color: pending ? roles.tertiary : undefined, fontWeight: 500 }}
      >
        {label}
      </Typography>
    </Box>
  )
}
