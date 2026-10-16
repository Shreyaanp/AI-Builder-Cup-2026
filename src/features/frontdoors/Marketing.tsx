import { useEffect, useRef, type CSSProperties } from 'react'
import { Box, Button, Typography, useTheme } from '@mui/material'
import {
  ArrowRight,
  Camera,
  Check,
  MessageCircle,
  Mic,
  PackageSearch,
  Sparkles,
  Stamp,
  TrendingUp,
} from 'lucide-react'
import { gsap } from 'gsap'
import { useChalkTimeline } from '../../design/chalkMotion'
import { motion } from '../../design/theme'
import { useToolCopy } from '../owner-tools/copy'
import { useFrontCopy } from './strings'
import './landing.css'

const businessUrl = 'https://business.chalkboard.shreyaan.work'

/** Two journeys, one neighbourhood. All illustrations are labelled examples, not live results. */
export default function Marketing() {
  const theme = useTheme()
  const roles = theme.material
  const t = useFrontCopy()
  const c = useToolCopy()
  const hero = useRef<HTMLDivElement>(null)
  useChalkTimeline(hero, (root) => {
    gsap.from(root, {
      opacity: 0,
      y: 16,
      duration: motion.duration.enter / 1000,
      ease: motion.easing.emphasizedDecelerate,
    })
  })
  useEffect(() => {
    document.title = 'Chalkboard · humanStack'
  }, [])
  const variables = {
    colorScheme: theme.palette.mode,
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
  } as CSSProperties
  const steps = [
    { icon: Mic, title: c.voiceTitle, body: c.voiceBody },
    { icon: Camera, title: t.photo, body: c.photoBody },
    { icon: Check, title: t.live, body: t.liveBody },
  ]
  const features = [
    { icon: Mic, title: c.voiceTitle, body: c.voiceBody, style: 'wide lang' },
    { icon: TrendingUp, title: c.forecastJob, body: c.forecastBody, style: 'recap' },
    { icon: PackageSearch, title: c.sourceJob, body: c.sourceBody, style: 'sold' },
    { icon: MessageCircle, title: c.customerAiTitle, body: c.customerBody, style: 'chat' },
    { icon: Stamp, title: c.stampsTitle, body: c.stampsBody, style: 'voice' },
    { icon: Sparkles, title: c.googleJob, body: c.googleBody, style: 'qr' },
  ]
  return (
    <div className="lp" style={variables}>
      <a className="lp-skip" href="#main">
        {t.skip}
      </a>
      <header className="lp-nav">
        <a className="lp-logo" href="/" translate="no">
          <span className="lp-logo-mark" aria-hidden="true" />
          Chalkboard
        </a>
        <nav aria-label="Chalkboard">
          <a href="/explore/">{t.find}</a>
          <Button variant="outlined" href={businessUrl}>
            {t.business}
          </Button>
        </nav>
      </header>
      <main id="main">
        <section className="lp-hero">
          <div className="lp-grid" aria-hidden="true" />
          <div className="lp-hero-copy" ref={hero}>
            <Typography component="h1" className="lp-title">
              {c.landingHero}
            </Typography>
            <Typography className="lp-intro" variant="bodyLarge">
              {c.landingIntro}
            </Typography>
            <div className="lp-cta">
              <Button
                variant="contained"
                size="large"
                href={businessUrl}
                endIcon={<ArrowRight size={18} />}
              >
                {c.ownerJourney}
              </Button>
              <Button variant="outlined" size="large" href="/explore/">
                {c.customerJourney}
              </Button>
            </div>
          </div>
          <div className="lp-hero-phone">
            <div className="lp-phone" aria-hidden="true">
              <div className="lp-phone-notch" />
              <div className="lp-phone-screen">
                <div className="lp-screen on static">
                  <div className="lp-app-bar" translate="no">
                    Chalkboard
                  </div>
                  <div className="lp-bubble me">
                    <Mic size={18} /> {c.voiceTitle}
                  </div>
                  <div className="lp-review">
                    <small>{c.ownerJourney}</small>
                    <strong>{c.menuJob}</strong>
                    <span>{c.photoBody}</span>
                  </div>
                  <div className="lp-bubble coach">
                    <MessageCircle size={18} /> {c.customerJourney}
                  </div>
                  <div className="lp-review">
                    <strong>{c.stampsTitle}</strong>
                    <span>{c.stampsBody}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <Box sx={{ px: { xs: 2, md: 6 }, pb: 3, maxWidth: 1200, mx: 'auto' }}>
          <Typography variant="bodyMedium" color="text.secondary">
            {c.aiLabel}
          </Typography>
        </Box>
        <section className="lp-story" aria-labelledby="story-title">
          <div className="lp-story-pin">
            <div className="lp-story-copy">
              <Typography id="story-title" component="h2" className="lp-h2">
                {t.storyTitle}
              </Typography>
              <ol className="lp-steps">
                {steps.map((step) => (
                  <li key={step.title} className="on">
                    <span className="lp-step-icon" aria-hidden="true">
                      <step.icon size={20} />
                    </span>
                    <div>
                      <Typography component="h3" variant="titleLarge">
                        {step.title}
                      </Typography>
                      <Typography variant="bodyLarge">{step.body}</Typography>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <Box sx={{ p: { xs: 0, md: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Typography component="h3" variant="headlineSmall">
                {c.customerJourney}
              </Typography>
              <Typography variant="bodyLarge">{c.customerBody}</Typography>
              <Button variant="outlined" href="/explore/" sx={{ alignSelf: 'flex-start' }}>
                {t.find}
              </Button>
            </Box>
          </div>
        </section>
        <section className="lp-bento-wrap" aria-labelledby="bento-title">
          <Typography id="bento-title" component="h2" className="lp-h2">
            {c.guideTitle}
          </Typography>
          <div className="lp-bento">
            {features.map((feature) => (
              <article key={feature.title} className={`lp-tile ${feature.style}`}>
                <feature.icon size={28} aria-hidden="true" />
                <div>
                  <Typography component="h3" variant="titleLarge">
                    {feature.title}
                  </Typography>
                  <Typography variant="bodyLarge">{feature.body}</Typography>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="lp-fan" aria-labelledby="fan-title">
          <div className="lp-fan-pin">
            <Typography id="fan-title" component="h2" className="lp-h2">
              {t.fresh}
            </Typography>
            <Typography variant="bodyLarge" className="lp-fan-body">
              {c.customerBody}
            </Typography>
            <div className="lp-cards" aria-hidden="true">
              {[c.customerJourney, c.stampsTitle, c.rescueJob].map((name, index) => (
                <div
                  key={name}
                  className="lp-card"
                  style={{ '--k': index - 1, '--c': roles.secondaryContainer } as CSSProperties}
                >
                  <div className="lp-card-art" />
                  <strong>{name}</strong>
                </div>
              ))}
            </div>
            <Button
              variant="contained"
              size="large"
              href="/explore/"
              endIcon={<ArrowRight size={18} />}
            >
              {c.customerJourney}
            </Button>
          </div>
        </section>
        <section className="lp-trust">
          <Typography component="h2" className="lp-h2">
            {t.trust}
          </Typography>
          <Typography variant="bodyLarge">{t.trustBody}</Typography>
        </section>
        <section className="lp-final">
          <Typography component="h2" className="lp-h2">
            {c.landingHero}
          </Typography>
          <div className="lp-cta">
            <Button variant="contained" size="large" href={businessUrl}>
              {c.ownerJourney}
            </Button>
            <Button variant="outlined" size="large" href="/explore/">
              {c.customerJourney}
            </Button>
          </div>
        </section>
      </main>
      <footer className="lp-footer">
        <Typography variant="bodyMedium">{t.independent}</Typography>
      </footer>
    </div>
  )
}
