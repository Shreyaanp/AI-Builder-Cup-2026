import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, CssBaseline, ThemeProvider, Typography, useTheme } from '@mui/material'
import type { Theme } from '@mui/material'
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  MapPin,
  MessageCircle,
  Mic,
  QrCode,
  Sparkles,
} from 'lucide-react'
import { LOCALE_NAMES, LOCALES } from '../../i18n/locales'
import { BrandLogo } from '../../design/BrandLogo'
import { LanguagePicker } from './LanguagePicker'
import { AppearanceToggle } from './AppearanceToggle'
import { useDemoCopy, useFrontCopy, useStoryCopy } from './strings'
import './landing.css'

const businessUrl = 'https://business.chalkboard.shreyaan.work'
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
// The same semantic roles and appearance as the app, including a remembered dark theme.
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
    '--tertiary-c': roles.tertiaryContainer,
    '--error-c': roles.errorContainer,
    '--on-error-c': roles.onErrorContainer,
    '--outline': roles.outlineVariant,
  }) as CSSProperties

/** Scroll progress (0 → 1) of an element through the viewport, written to a CSS variable. */
function useScrollProgress(onStep?: (progress: number) => void) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let frame = 0
    const update = () => {
      frame = 0
      const box = node.getBoundingClientRect()
      const travel = box.height - innerHeight
      const progress = Math.min(1, Math.max(0, travel > 0 ? -box.top / travel : 0))
      node.style.setProperty('--p', progress.toFixed(4))
      onStep?.(progress)
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
  }, [onStep])
  return ref
}

/** Adds `.in` to [data-reveal] children the first time they enter the viewport. */
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
      { threshold: 0.15 },
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [root])
}

/** A message that types itself once it is on screen. */
function Typed({ text, delay = 0 }: { text: string; delay?: number }) {
  const [shown, setShown] = useState(() => (reduced() ? text.length : 0))
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (reduced()) return
    let timer = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      observer.disconnect()
      let index = 0
      const tick = () => {
        index += 1
        setShown(index)
        if (index < text.length) timer = window.setTimeout(tick, 28)
      }
      timer = window.setTimeout(tick, delay)
    })
    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [text, delay])
  return (
    <span ref={ref}>
      {/* Screen readers get the whole sentence; the typing is visual only. */}
      <span className="lp-sr">{text}</span>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      {shown < text.length && <span className="lp-caret" aria-hidden="true" />}
    </span>
  )
}

function Phone({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="lp-phone" role="img" aria-label={label}>
      <div className="lp-phone-notch" aria-hidden="true" />
      <div className="lp-phone-screen">{children}</div>
    </div>
  )
}

/** Three screens of the product, shown as the story scrolls. */
function StoryScreen({ step }: { step: number }) {
  const s = useStoryCopy()
  return (
    <>
      <div className={`lp-screen ${step === 0 ? 'on' : ''}`} aria-hidden={step !== 0}>
        <div className="lp-viewfinder">
          <div className="lp-board">
            <span>MENU</span>
            <span>{s.boardItem1}</span>
            <span>{s.boardItem2}</span>
            <span>{s.boardItem3}</span>
          </div>
          <div className="lp-scanline" />
        </div>
        <div className="lp-shimmer">
          <Camera size={16} /> {s.readingBoard}
        </div>
      </div>
      <div className={`lp-screen ${step === 1 ? 'on' : ''}`} aria-hidden={step !== 1}>
        <div className="lp-bubble me">{s.bubbleMe}</div>
        <div className="lp-bubble coach">{s.bubbleCoach}</div>
        <div className="lp-review">
          <small>{s.checkBeforeSaving}</small>
          <strong>
            {s.item1} · {s.priceNew} / cup
          </strong>
          <em>
            {s.item3} · {s.soldOut}
          </em>
          <span className="lp-confirm">
            <Check size={16} /> {s.confirmAndSave}
          </span>
        </div>
      </div>
      <div className={`lp-screen ${step === 2 ? 'on' : ''}`} aria-hidden={step !== 2}>
        <div className="lp-shop-head">
          <div className="lp-thumb" />
          <div>
            <strong>{s.shopName}</strong>
            <span className="lp-open">{s.openNowArea}</span>
          </div>
        </div>
        <div className="lp-chips">
          <span>{s.chipDiet}</span>
          <span>{s.chipPayment}</span>
          <span>{s.updatedToday}</span>
        </div>
        <ul className="lp-menu">
          <li>
            <span>{s.item1}</span>
            <b>{s.priceNew}</b>
          </li>
          <li>
            <span>{s.item2}</span>
            <b>{s.price2}</b>
          </li>
          <li className="out">
            <span>{s.item3}</span>
            <i>{s.soldOut}</i>
          </li>
        </ul>
        <span className="lp-chat">
          <MessageCircle size={16} /> {s.chatWithShop}
        </span>
      </div>
    </>
  )
}

export default function Marketing() {
  const theme = useTheme()
  const t = useFrontCopy()
  const demo = useDemoCopy()
  const s = useStoryCopy()
  const page = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const onStory = useCallback((p: number) => setStep(p < 0.34 ? 0 : p < 0.67 ? 1 : 2), [])
  const story = useScrollProgress(onStory)
  const fan = useScrollProgress()
  useReveal(page)
  useEffect(() => {
    document.title = 'Chalkboard · humanStack'
  }, [])
  const steps = [
    { icon: Camera, title: t.photo, body: t.photoBody },
    { icon: Sparkles, title: t.coach, body: t.coachBody },
    { icon: Check, title: t.live, body: t.liveBody },
  ]
  const greetings = [
    'Kopi ready?',
    '咖啡好了吗？',
    'Kopi dah siap?',
    'காபி தயாரா?',
    'コーヒーできた？',
    '커피 됐어요?',
    'Kopinya sudah?',
    'กาแฟได้หรือยัง',
    'Cà phê xong chưa?',
    'Handa na ang kape?',
  ]
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div ref={page} className="lp" style={brandVars(theme.material, theme.palette.mode)}>
        <a className="lp-skip" href="#main">
          {t.skip}
        </a>
        <header className="lp-nav">
          <BrandLogo href="/" />
          <nav aria-label="Chalkboard">
            <LanguagePicker variant="nav" />
            <a href="/explore/" className="lp-nav-find">
              {t.find}
            </a>
            <Button
              className="lp-nav-business"
              variant="outlined"
              href={businessUrl}
              endIcon={<ArrowUpRight size={16} />}
            >
              {t.business}
            </Button>
            <AppearanceToggle inline />
          </nav>
        </header>

        <main id="main">
          {/* Hero: wireframe grid, morphing M3 shapes, a phone that talks. */}
          <section className="lp-hero">
            <div className="lp-grid" aria-hidden="true" />
            <div className="lp-blob a" aria-hidden="true" />
            <div className="lp-blob b" aria-hidden="true" />
            <div className="lp-hero-copy">
              <Typography component="h1" className="lp-title">
                {t.hero}
              </Typography>
              <Typography className="lp-intro" variant="bodyLarge">
                {t.intro}
              </Typography>
              <div className="lp-cta">
                <Button
                  variant="contained"
                  size="large"
                  href="/explore/"
                  endIcon={<ArrowRight size={18} />}
                >
                  {t.find}
                </Button>
                <Button
                  className="lp-cta-business"
                  variant="outlined"
                  size="large"
                  href={businessUrl}
                  endIcon={<ArrowUpRight size={18} />}
                >
                  {t.business}
                </Button>
                <Button variant="text" size="large" href={businessUrl + '/demo'}>
                  {demo.tryDemo}
                </Button>
              </div>
            </div>
            <div className="lp-hero-phone">
              <Phone label={t.how}>
                <div className="lp-screen on static">
                  <div className="lp-app-bar">Chalkboard</div>
                  <div className="lp-bubble me">
                    <Typed text={s.bubbleMe} delay={400} />
                  </div>
                  <div className="lp-bubble coach delay">{s.bubbleCoach}</div>
                  <div className="lp-review delay2">
                    <small>{s.checkBeforeSaving}</small>
                    <strong>
                      {s.item1} · {s.priceNew} / cup
                    </strong>
                    <em>
                      {s.item3} · {s.soldOut}
                    </em>
                    <span className="lp-confirm">{s.confirmAndSave}</span>
                  </div>
                </div>
              </Phone>
              <div className="lp-float one" aria-hidden="true">
                <Mic size={16} /> Voice in 9 languages
              </div>
              <div className="lp-float two" aria-hidden="true">
                <Check size={16} /> You confirm every change
              </div>
            </div>
          </section>

          {/* Scroll story: a pinned phone changes screen; wireframe lines draw themselves. */}
          <section
            ref={story as React.RefObject<HTMLElement>}
            className="lp-story"
            aria-labelledby="story-title"
          >
            <div className="lp-story-pin">
              <div className="lp-story-copy">
                <Typography id="story-title" component="h2" className="lp-h2">
                  {t.storyTitle}
                </Typography>
                <ol className="lp-steps">
                  {steps.map((item, index) => (
                    <li key={item.title} className={index === step ? 'on' : ''}>
                      <span className="lp-step-icon" aria-hidden="true">
                        <item.icon size={20} />
                      </span>
                      <div>
                        <Typography component="h3" variant="titleLarge">
                          {item.title}
                        </Typography>
                        <Typography variant="bodyLarge">{item.body}</Typography>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="lp-rail" aria-hidden="true">
                  <span />
                </div>
              </div>
              <div className="lp-story-phone">
                <svg className="lp-wire" viewBox="0 0 400 520" aria-hidden="true">
                  <rect x="12" y="12" width="376" height="496" rx="36" />
                  <path d="M40 120 H360 M40 200 H300 M40 280 H330 M40 360 H260" />
                  <circle cx="330" cy="70" r="22" />
                </svg>
                <Phone label={t.how}>
                  <StoryScreen step={step} />
                </Phone>
              </div>
            </div>
          </section>

          {/* Bento: one idea per tile, each with its own small motion. */}
          <section className="lp-bento-wrap" aria-labelledby="bento-title">
            <Typography id="bento-title" component="h2" className="lp-h2" data-reveal>
              {t.bentoTitle}
            </Typography>
            <div className="lp-bento">
              <article className="lp-tile wide lang" data-reveal>
                <Typography component="h3" variant="headlineSmall">
                  {t.languages}
                </Typography>
                <Typography variant="bodyLarge">{t.languagesBody}</Typography>
                <div className="lp-marquee" aria-hidden="true">
                  <div>
                    {[...greetings, ...greetings].map((text, index) => (
                      <span key={index}>{text}</span>
                    ))}
                  </div>
                </div>
                <span className="lp-sr">
                  {LOCALES.map((code) => LOCALE_NAMES[code]).join(', ')}
                </span>
              </article>
              <article className="lp-tile voice" data-reveal>
                <Mic size={28} aria-hidden="true" />
                <Typography component="h3" variant="titleLarge">
                  {t.voiceTile}
                </Typography>
                <div className="lp-wave" aria-hidden="true">
                  {Array.from({ length: 14 }, (_, index) => (
                    <i key={index} style={{ '--i': index } as CSSProperties} />
                  ))}
                </div>
              </article>
              <article className="lp-tile sold" data-reveal>
                <Typography component="h3" variant="titleLarge">
                  {t.soldOutTile}
                </Typography>
                <div className="lp-switch-row" aria-hidden="true">
                  <span>Kaya toast</span>
                  <span className="lp-switch" />
                </div>
              </article>
              <article className="lp-tile recap" data-reveal>
                <Typography component="h3" variant="titleLarge">
                  {t.recapTile}
                </Typography>
                <div className="lp-bars" aria-hidden="true">
                  {[42, 64, 38, 80, 72, 95, 60].map((height, index) => (
                    <i key={index} style={{ '--h': `${height}%`, '--i': index } as CSSProperties} />
                  ))}
                </div>
              </article>
              <article className="lp-tile chat" data-reveal>
                <Typography component="h3" variant="titleLarge">
                  {t.chatTile}
                </Typography>
                <div className="lp-mini-chat" aria-hidden="true">
                  <span className="q">Is the kaya toast halal?</span>
                  <span className="a">Yes, listed as halal by the shop.</span>
                </div>
              </article>
              <article className="lp-tile qr" data-reveal>
                <QrCode size={72} aria-hidden="true" />
                <div>
                  <Typography component="h3" variant="headlineSmall">
                    {t.qrTile}
                  </Typography>
                  <Typography variant="bodyLarge">{t.liveBody}</Typography>
                </div>
              </article>
            </div>
          </section>

          {/* For customers: discovery cards fan out as you scroll. */}
          <section
            ref={fan as React.RefObject<HTMLElement>}
            className="lp-fan"
            aria-labelledby="fan-title"
          >
            <div className="lp-fan-pin">
              <Typography id="fan-title" component="h2" className="lp-h2">
                {t.fresh}
              </Typography>
              <Typography variant="bodyLarge" className="lp-fan-body">
                {t.freshBody}
              </Typography>
              <div className="lp-cards" aria-hidden="true">
                {[
                  ['Ah Seng Kopi', 'Kopitiam · Open now', '#f6d365'],
                  ['Rotiboy Corner', 'Bakery · 300 m', '#fda085'],
                  ['Glow Hair Studio', 'Salon · Walk-ins today', '#a1c4fd'],
                  ['Menya Hoshi', 'Ramen · Open now', '#c2e9fb'],
                  ['Som Tam Nong', 'Thai · 1 sold out', '#d4fc79'],
                ].map(([name, line, color], index) => (
                  <div
                    key={name}
                    className="lp-card"
                    style={{ '--k': index - 2, '--c': color } as CSSProperties}
                  >
                    <div className="lp-card-art" />
                    <strong>{name}</strong>
                    <span>
                      <MapPin size={12} /> {line}
                    </span>
                  </div>
                ))}
              </div>
              <Button
                variant="contained"
                size="large"
                href="/explore/"
                endIcon={<ArrowRight size={18} />}
              >
                {t.find}
              </Button>
            </div>
          </section>

          <section className="lp-trust" data-reveal aria-labelledby="trust-title">
            <Typography id="trust-title" component="h2" className="lp-h2">
              {t.trust}
            </Typography>
            <Typography variant="bodyLarge">{t.trustBody}</Typography>
          </section>

          <section className="lp-final" data-reveal aria-labelledby="final-title">
            <Typography id="final-title" component="h2" className="lp-final-title">
              {t.ctaTitle}
            </Typography>
            <div className="lp-cta">
              <Button variant="contained" size="large" href={businessUrl}>
                {t.business}
              </Button>
              <Button variant="outlined" size="large" href="/explore/">
                {t.find}
              </Button>
            </div>
          </section>
        </main>
      </div>
    </ThemeProvider>
  )
}
