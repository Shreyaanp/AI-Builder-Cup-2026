import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, Typography, useTheme } from '@mui/material'
import type { Theme } from '@mui/material'
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Coffee,
  Footprints,
  Heart,
  Languages,
  LayoutList,
  MessageCircle,
  Mic,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Stamp,
  Store,
  Sun,
  Truck,
  Volume2,
} from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { AppearanceToggle } from './AppearanceToggle'
import { LanguagePicker } from './LanguagePicker'
import { pagesCopyFor, posterSrc, videoSrc, type PagesCopy } from './howItWorksCopy'
import './how-it-works.css'

type Flow = 'vendor' | 'customer'
type Page = 'how' | 'features'

const businessUrl = 'https://business.chalkboard.shreyaan.work'
const demoUrl = `${businessUrl}/demo`
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// The app's semantic roles (and its remembered light/dark choice), as on the landing.
const brandVars = (roles: Theme['material'], mode: Theme['palette']['mode']) =>
  ({
    colorScheme: mode,
    '--ink': roles.onSurface,
    '--muted': roles.onSurfaceVariant,
    '--surface': roles.surface,
    '--surface-low': roles.surfaceContainerLow,
    '--surface-high': roles.surfaceContainerHigh,
    '--primary': roles.primary,
    '--on-primary': roles.onPrimary,
    '--primary-c': roles.primaryContainer,
    '--on-primary-c': roles.onPrimaryContainer,
    '--secondary-c': roles.secondaryContainer,
    '--on-secondary-c': roles.onSecondaryContainer,
    '--tertiary-c': roles.tertiaryContainer,
    '--on-tertiary-c': roles.onTertiaryContainer,
    '--outline': roles.outlineVariant,
  }) as CSSProperties

const pageFor = (path: string): Page => (/^\/features\/?$/.test(path) ? 'features' : 'how')

/**
 * A phone-shaped demo video with a voiceover. Nothing downloads until it nears the screen; it
 * plays muted while visible (never with reduced motion) and keeps its controls. "Tap for sound"
 * starts it again from the top with the voice.
 */
export function FlowVideo({ flow, label, sound }: { flow: Flow; label: string; sound: string }) {
  const locale = useLocale()
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const src = videoSrc(flow, locale)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting) {
          if (!video.getAttribute('src')) {
            video.src = src
            video.preload = 'auto'
          }
          if (!reducedMotion()) void video.play().catch(() => undefined)
        } else if (!video.paused) video.pause()
      },
      { rootMargin: '200px 0px', threshold: 0.35 },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [src])
  const listen = () => {
    const video = ref.current
    if (!video) return
    if (!video.getAttribute('src')) video.src = src
    video.muted = false
    video.currentTime = 0
    void video.play().catch(() => undefined)
  }
  return (
    <div className="hw-player">
      <div className="hw-phone">
        <video
          key={src}
          ref={ref}
          className="hw-video"
          data-testid={`${flow}-video`}
          data-src={src}
          poster={posterSrc(flow, locale)}
          aria-label={label}
          muted
          loop
          playsInline
          controls
          preload="none"
          width={720}
          height={1280}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        />
      </div>
      {muted && (
        <button type="button" className="hw-sound" onClick={listen}>
          <Volume2 size={20} aria-hidden="true" />
          {sound}
        </button>
      )}
    </div>
  )
}

function Header({ t, page }: { t: PagesCopy; page: Page }) {
  return (
    <header className="hw-nav">
      <a className="hw-logo" href="/">
        <span className="hw-logo-mark" aria-hidden="true" />
        {t.brand}
      </a>
      <nav aria-label={t.brand}>
        {page !== 'how' && (
          <a className="hw-nav-link" href="/how-it-works">
            {t.seeHow}
          </a>
        )}
        {page !== 'features' && (
          <a className="hw-nav-link" href="/features">
            {t.seeFeatures}
          </a>
        )}
        <LanguagePicker variant="nav" />
        <AppearanceToggle inline />
      </nav>
    </header>
  )
}

/** One flow: who it is for, one line, the video, its steps and the next step. */
function FlowSection({ flow, t, cta }: { flow: Flow; t: PagesCopy; cta: ReactNode }) {
  const shops = flow === 'vendor'
  // The last caption is the end card, not a step.
  const steps = (shops ? t.vendorCaptions : t.customerCaptions).slice(0, -1)
  const id = `${flow}-title`
  return (
    <section className={`hw-flow ${flow}`} aria-labelledby={id}>
      <div className="hw-flow-copy">
        <span className="hw-chip">
          {shops ? (
            <Store size={18} aria-hidden="true" />
          ) : (
            <Footprints size={18} aria-hidden="true" />
          )}
          {shops ? t.forShops : t.forCustomers}
        </span>
        <Typography id={id} component="h2" className="hw-flow-line">
          {shops ? t.shopsLine : t.customersLine}
        </Typography>
      </div>
      <figure className="hw-figure">
        <FlowVideo flow={flow} label={shops ? t.shopsVideo : t.customersVideo} sound={t.sound} />
        <figcaption className="hw-note">{t.videoNote}</figcaption>
      </figure>
      <ol className="hw-steps" aria-label={`${shops ? t.forShops : t.forCustomers}: ${t.steps}`}>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="hw-cta">{cta}</div>
    </section>
  )
}

function ShopsCta({ t }: { t: PagesCopy }) {
  return (
    <div className="hw-cta-pair">
      <Button variant="contained" size="large" href={demoUrl} endIcon={<ArrowRight size={18} />}>
        {t.tryDemo}
      </Button>
      <Button
        variant="outlined"
        size="large"
        href={businessUrl}
        endIcon={<ArrowUpRight size={18} />}
      >
        {t.forBusiness}
      </Button>
    </div>
  )
}

function CustomersCta({ t }: { t: PagesCopy }) {
  return (
    <Button variant="contained" size="large" href="/explore/" endIcon={<ArrowRight size={18} />}>
      {t.findPlaces}
    </Button>
  )
}

const trustIcons = [Sparkles, Languages, ShieldCheck, MessageCircle]

/** The four promises as big tags, two by two (the landing, /how-it-works and /features). */
export function TrustTags({ t }: { t: PagesCopy }) {
  return (
    <ul className="hw-trust" data-testid="trust-strip">
      {t.trustItems.map(([title, line], index) => {
        const Icon = trustIcons[index] ?? Sparkles
        return (
          <li key={title} style={{ '--i': index } as CSSProperties}>
            <span className="hw-trust-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <strong>{title}</strong>
            <span>{line}</span>
          </li>
        )
      })}
    </ul>
  )
}

function How({ t }: { t: PagesCopy }) {
  return (
    <>
      <section className="hw-hero">
        <Typography component="h1" className="hw-title">
          {t.howTitle}
        </Typography>
        <Typography className="hw-lead">{t.lead}</Typography>
        <nav className="hw-jump" aria-label={t.watch}>
          <a href="#vendor">
            <Store size={20} aria-hidden="true" />
            <strong>{t.forShops}</strong>
          </a>
          <a href="#customer">
            <Footprints size={20} aria-hidden="true" />
            <strong>{t.forCustomers}</strong>
          </a>
        </nav>
      </section>
      <div id="vendor" className="hw-anchor">
        <FlowSection flow="vendor" t={t} cta={<ShopsCta t={t} />} />
      </div>
      <div id="customer" className="hw-anchor">
        <FlowSection flow="customer" t={t} cta={<CustomersCta t={t} />} />
      </div>
      <section className="hw-more">
        <TrustTags t={t} />
        <Button variant="text" size="large" href="/features" endIcon={<ArrowRight size={18} />}>
          {t.seeFeatures}
        </Button>
      </section>
    </>
  )
}

const shopIcons = [Mic, QrCode, Sun, Truck, Camera, Stamp]
const customerIcons = [Search, LayoutList, Heart, Stamp]

function FeatureGrid({ flow, t, items }: { flow: Flow; t: PagesCopy; items: string[][] }) {
  const shops = flow === 'vendor'
  const icons = shops ? shopIcons : customerIcons
  const id = `${flow}-features`
  return (
    <section className={`hw-features ${flow}`} aria-labelledby={id}>
      <span className="hw-chip">
        {shops ? (
          <Store size={18} aria-hidden="true" />
        ) : (
          <Footprints size={18} aria-hidden="true" />
        )}
        {shops ? t.forShops : t.forCustomers}
      </span>
      <Typography id={id} component="h2" className="hw-flow-line">
        {shops ? t.shopsLine : t.customersLine}
      </Typography>
      <ul className="hw-grid">
        {items.map(([title, line], index) => {
          const Icon = icons[index] ?? Coffee
          return (
            <li key={title} className="hw-card">
              <Icon size={28} aria-hidden="true" />
              <Typography component="h3" variant="titleLarge">
                {title}
              </Typography>
              <Typography variant="bodyLarge">{line}</Typography>
            </li>
          )
        })}
      </ul>
      <div className="hw-cta">
        {shops ? <ShopsCta t={t} /> : <CustomersCta t={t} />}
        <Button
          variant="text"
          size="large"
          href={`/how-it-works#${flow}`}
          endIcon={<ArrowRight size={18} />}
        >
          {t.watch}
        </Button>
      </div>
    </section>
  )
}

function Features({ t }: { t: PagesCopy }) {
  return (
    <>
      <section className="hw-hero">
        <Typography component="h1" className="hw-title">
          {t.featuresTitle}
        </Typography>
        <Typography className="hw-lead">{t.lead}</Typography>
      </section>
      <FeatureGrid flow="vendor" t={t} items={t.shopFeatures} />
      <FeatureGrid flow="customer" t={t} items={t.customerFeatures} />
      <section className="hw-more">
        <TrustTags t={t} />
      </section>
    </>
  )
}

/** /how-it-works and /features: public, on both hosts, no API calls. */
export default function HowItWorks() {
  const theme = useTheme()
  const t = pagesCopyFor(useLocale())
  const page = pageFor(location.pathname)
  const title = page === 'features' ? t.featuresTitle : t.howTitle
  useEffect(() => {
    document.title = `${title} · Chalkboard`
  }, [title])
  return (
    <div className="hw" style={brandVars(theme.material, theme.palette.mode)}>
      <a className="hw-skip" href="#hw-main">
        {t.skip}
      </a>
      <Header t={t} page={page} />
      <main id="hw-main" tabIndex={-1}>
        {page === 'features' ? <Features t={t} /> : <How t={t} />}
      </main>
      <footer className="hw-footer">
        <a href="/">{t.home}</a>
        <a href="/how-it-works">{t.seeHow}</a>
        <a href="/features">{t.seeFeatures}</a>
      </footer>
    </div>
  )
}
