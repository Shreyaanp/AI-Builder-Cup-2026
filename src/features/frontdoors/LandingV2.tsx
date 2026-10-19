import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Button, Typography, useTheme } from '@mui/material'
import type { Theme } from '@mui/material'
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Coffee,
  Footprints,
  MapPin,
  Mic,
  QrCode,
  Store,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { AppearanceToggle } from './AppearanceToggle'
import { FlowVideo, TrustTags } from './HowItWorks'
import { BrandLogo } from '../../design/BrandLogo'
import { LanguagePicker } from './LanguagePicker'
import { pagesCopyFor, type PagesCopy } from './howItWorksCopy'
import './landing-v2.css'
import './landing-v2-desktop.css'

const businessUrl = 'https://business.chalkboard.shreyaan.work'
const demoUrl = `${businessUrl}/demo`
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// The app's semantic roles and remembered light/dark choice, as on the classic landing.
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

/** Adds `.in` to [data-reveal] children the first time they come on screen. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const nodes = root.current?.querySelectorAll('[data-reveal]') ?? []
    if (reduced()) {
      nodes.forEach((node) => node.classList.add('in'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            observer.unobserve(entry.target)
          }
      },
      { threshold: 0.2 },
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [root])
}

/**
 * How far the reader is through the chai journey (0 → 1), written to `--p`, and which stop the
 * cup has reached. Without motion the cup rests at the end and every stop is lit.
 */
function useJourney(stops: number) {
  const ref = useRef<HTMLOListElement>(null)
  const [reached, setReached] = useState(() => (reduced() ? stops - 1 : 0))
  useEffect(() => {
    const node = ref.current
    if (!node || reduced()) return
    let frame = 0
    const update = () => {
      frame = 0
      const box = node.getBoundingClientRect()
      // The cup sits at the middle of the screen as the list scrolls past it.
      const progress = Math.min(1, Math.max(0, (innerHeight * 0.55 - box.top) / box.height))
      node.style.setProperty('--p', progress.toFixed(4))
      node.style.setProperty('--y', `${(progress * (box.height - 40)).toFixed(1)}px`)
      setReached(Math.min(stops - 1, Math.floor(progress * stops)))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    addEventListener('scroll', schedule, { passive: true })
    addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      removeEventListener('scroll', schedule)
      removeEventListener('resize', schedule)
    }
  }, [stops])
  return { ref, reached }
}

/** Two actions side by side: the demo first, then finding shops. */
function Actions({ t, className = '' }: { t: PagesCopy; className?: string }) {
  return (
    <div className={`l2-actions ${className}`}>
      <Button
        variant="contained"
        size="large"
        href={businessUrl}
        endIcon={<ArrowUpRight size={18} />}
      >
        {t.businessShort}
      </Button>
      <Button variant="outlined" size="large" href="/explore/">
        {t.findShort}
      </Button>
    </div>
  )
}

/** The three things it does, as big tiles, each with one small motion that shows it. */
function Does({ t }: { t: PagesCopy }) {
  const [talk, find, stock] = t.does
  return (
    <section className="l2-does" aria-label={t.featuresTitle}>
      <article className="l2-tile talk" data-reveal>
        <span className="l2-tile-icon" aria-hidden="true">
          <Mic size={26} />
        </span>
        <Typography component="h2" className="l2-tile-title">
          {talk![0]}
        </Typography>
        <Typography className="l2-tile-body">{talk![1]}</Typography>
        <div className="l2-wave" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <i key={index} style={{ '--i': index } as CSSProperties} />
          ))}
        </div>
      </article>
      <article className="l2-tile find" data-reveal>
        <span className="l2-tile-icon" aria-hidden="true">
          <MapPin size={26} />
        </span>
        <Typography component="h2" className="l2-tile-title">
          {find![0]}
        </Typography>
        <Typography className="l2-tile-body">{find![1]}</Typography>
        <div className="l2-stamps" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} style={{ '--i': index } as CSSProperties}>
              {index === 7 ? <Coffee size={14} /> : null}
            </i>
          ))}
        </div>
      </article>
      <article className="l2-tile stock" data-reveal>
        <span className="l2-tile-icon" aria-hidden="true">
          <Truck size={26} />
        </span>
        <Typography component="h2" className="l2-tile-title">
          {stock![0]}
        </Typography>
        <Typography className="l2-tile-body">{stock![1]}</Typography>
        <ul className="l2-sizes">
          {t.sizes.map(([size, channel], index) => (
            <li key={size} style={{ '--i': index } as CSSProperties}>
              <span>{size}</span>
              <b>{channel}</b>
            </li>
          ))}
        </ul>
      </article>
    </section>
  )
}

const stopIcons: LucideIcon[] = [Store, Footprints, QrCode, Truck, Warehouse, Building2]

/** One cup of chai travels down the page: stall, customer, counter, wholesaler, distributor, chain. */
function Journey({ t }: { t: PagesCopy }) {
  const { ref, reached } = useJourney(t.story.length)
  return (
    <section className="l2-journey" aria-labelledby="l2-journey-title">
      <Typography id="l2-journey-title" component="h2" className="l2-h2" data-reveal>
        {t.storyTitle}
      </Typography>
      <Typography className="l2-lead" data-reveal>
        {t.storyLead}
      </Typography>
      <ol ref={ref} className="l2-stops">
        <span className="l2-rail" aria-hidden="true">
          <span />
        </span>
        <span className="l2-cup" aria-hidden="true">
          <Coffee size={22} />
        </span>
        {t.story.map(([stop, line, tech], index) => {
          const Icon = stopIcons[index] ?? Store
          return (
            <li key={stop} className={index <= reached ? 'on' : ''}>
              <span className="l2-stop-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <div>
                <span className="l2-stop">{stop}</span>
                <strong>{line}</strong>
                <span className="l2-tech">{tech}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Both demo videos in one phone: pick shops or customers. */
function Videos({ t }: { t: PagesCopy }) {
  const [flow, setFlow] = useState<'vendor' | 'customer'>('vendor')
  const shops = flow === 'vendor'
  return (
    <section className="l2-videos" aria-labelledby="l2-videos-title">
      <Typography id="l2-videos-title" component="h2" className="l2-h2" data-reveal>
        {t.videosTitle}
      </Typography>
      <div className="l2-switch" role="group" aria-label={t.videosTitle}>
        <button type="button" aria-pressed={shops} onClick={() => setFlow('vendor')}>
          <Store size={18} aria-hidden="true" />
          {t.forShops}
        </button>
        <button type="button" aria-pressed={!shops} onClick={() => setFlow('customer')}>
          <Footprints size={18} aria-hidden="true" />
          {t.forCustomers}
        </button>
      </div>
      <Typography className="l2-video-line">{shops ? t.shopsLine : t.customersLine}</Typography>
      <FlowVideo
        key={flow}
        flow={flow}
        label={shops ? t.shopsVideo : t.customersVideo}
        sound={t.sound}
      />
      <p className="l2-note">{t.videoNote}</p>
    </section>
  )
}

/** The new landing: what it does in plain words, then one cup of chai, then the videos. */
export default function LandingV2({ preview = false }: { preview?: boolean }) {
  const theme = useTheme()
  const t = pagesCopyFor(useLocale())
  const page = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLDivElement>(null)
  const final = useRef<HTMLElement>(null)
  // The thumb bar shows once the hero's buttons scroll away, and hides at the closing buttons.
  const [dock, setDock] = useState(false)
  useReveal(page)
  useEffect(() => {
    document.title = `Chalkboard · ${t.hero}`
    if (!preview) return
    // The preview must never be indexed or mistaken for the live landing.
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => robots.remove()
  }, [t.hero, preview])
  useEffect(() => {
    const seen = new Map<Element, boolean>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, entry.isIntersecting)
      const heroVisible = hero.current ? (seen.get(hero.current) ?? true) : true
      const finalVisible = final.current ? (seen.get(final.current) ?? false) : false
      setDock(!heroVisible && !finalVisible)
    })
    if (hero.current) observer.observe(hero.current)
    if (final.current) observer.observe(final.current)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={page} className="l2" style={brandVars(theme.material, theme.palette.mode)}>
      <a className="l2-skip" href="#l2-main">
        {t.skip}
      </a>
      <header className="l2-nav">
        <BrandLogo name={t.brand} href="/" />
        <nav aria-label={t.brand}>
          <LanguagePicker variant="nav" />
          <AppearanceToggle inline />
        </nav>
      </header>
      {preview && (
        <p className="l2-banner" role="note">
          {t.previewBanner}
        </p>
      )}
      <main id="l2-main" tabIndex={-1}>
        <section className="l2-hero">
          <div className="l2-blob a" aria-hidden="true" />
          <div className="l2-blob b" aria-hidden="true" />
          <div className="l2-hero-copy">
            <Typography component="h1" className="l2-title">
              {/* Words rise in one after another; the spaces stay outside the moving boxes. */}
              {t.hero.split(' ').map((word, index) => (
                <Fragment key={index}>
                  {index > 0 && ' '}
                  <span style={{ '--w': index } as CSSProperties}>{word}</span>
                </Fragment>
              ))}
            </Typography>
            <Typography className="l2-who">{t.lead}</Typography>
            <div ref={hero}>
              <Actions t={t} />
            </div>
          </div>
          {/* Wide screens only: two moments from the story beside the headline. */}
          <div className="l2-hero-visual" aria-hidden="true">
            {t.story.slice(0, 2).map(([stop, line]) => (
              <p key={stop}>
                <span>{stop}</span>
                <strong>{line}</strong>
              </p>
            ))}
          </div>
        </section>

        <Does t={t} />
        <Journey t={t} />
        {/* Wide screens: the videos and the trust tags sit side by side; phones stack them. */}
        <div className="l2-pair">
          <Videos t={t} />

          {/* Wide screens: the trust tags and the founder's note share one column as tall as the video. */}
          <div className="l2-trust-col">
            <section className="l2-trust" aria-labelledby="l2-trust-title">
              <Typography id="l2-trust-title" component="h2" className="l2-h2" data-reveal>
                {t.trustTitle}
              </Typography>
              <TrustTags t={t} />
            </section>
            <figure className="l2-founder" data-reveal>
              <blockquote>{t.founder}</blockquote>
              <figcaption>{t.founderName}</figcaption>
            </figure>
          </div>
        </div>

        <section ref={final} className="l2-final" aria-labelledby="l2-final-title" data-reveal>
          <Typography id="l2-final-title" component="h2" className="l2-final-title">
            {t.finalTitle}
          </Typography>
          <div className="l2-actions">
            <Button
              variant="contained"
              size="large"
              href={businessUrl}
              endIcon={<ArrowUpRight size={18} />}
            >
              {t.forBusiness}
            </Button>
            <Button variant="outlined" size="large" href={demoUrl}>
              {t.tryShort}
            </Button>
          </div>
        </section>

        <nav className="l2-more" aria-label={t.previewHow}>
          <a href="/how-it-works">
            {t.previewHow} <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a href="/features">
            {t.seeFeatures} <ArrowRight size={16} aria-hidden="true" />
          </a>
        </nav>
      </main>
      <footer className="l2-footer">
        <span>{t.site}</span>
      </footer>
      <div className={`l2-dock ${dock ? 'on' : ''}`} aria-hidden={!dock} inert={!dock}>
        <Actions t={t} />
      </div>
    </div>
  )
}
