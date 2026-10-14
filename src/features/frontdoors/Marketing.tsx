import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { ArrowUpRight, Camera, Check, MessageCircle } from 'lucide-react'
import { LOCALE_NAMES, LOCALES } from '../../i18n/locales'
import { useFrontCopy } from './strings'
import './frontdoors.css'

const ChalkScene = lazy(() => import('./ChalkScene'))
const businessUrl = 'https://business.chalkboard.shreyaan.work'

export default function Marketing() {
  const t = useFrontCopy()
  const roles = useTheme().material
  const [scene, setScene] = useState(false)
  const page = useRef<HTMLDivElement>(null)
  useEffect(() => {
    document.title = 'Chalkboard · humanStack'
  }, [])
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const device = navigator as Navigator & {
      deviceMemory?: number
      connection?: { saveData?: boolean }
    }
    if (
      media.matches ||
      device.connection?.saveData ||
      (device.deviceMemory ?? 8) < 4 ||
      (navigator.hardwareConcurrency ?? 8) < 4
    )
      return
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setScene(true))
    })
    const stop = () => {
      if (media.matches) setScene(false)
    }
    media.addEventListener('change', stop)
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
      media.removeEventListener('change', stop)
    }
  }, [])
  useEffect(() => {
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      CSS.supports('animation-timeline: view()')
    )
      return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
            observer.unobserve(entry.target)
          }
      },
      { threshold: 0.1 },
    )
    page.current?.querySelectorAll('[data-reveal]').forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])
  const steps = [
    { icon: Camera, title: t.photo, body: t.photoBody },
    { icon: MessageCircle, title: t.coach, body: t.coachBody },
    { icon: Check, title: t.live, body: t.liveBody },
  ]
  return (
    <Box
      ref={page}
      className="marketing"
      sx={{
        '--front-surface': roles.surface,
        '--front-ink': roles.onSurface,
        '--front-primary': roles.primary,
        '--front-tonal': roles.primaryContainer,
        '--front-on-tonal': roles.onPrimaryContainer,
      }}
    >
      <a className="skip-link" href="#marketing-content">
        {t.skip}
      </a>
      <header className="front-header">
        <a href="/" className="wordmark" translate="no">
          <img src="/icons/customer.svg" width="36" height="36" alt="" />
          Chalkboard
        </a>
        <Button
          href={businessUrl}
          variant="outlined"
          endIcon={<ArrowUpRight aria-hidden size={18} />}
        >
          {t.business}
        </Button>
      </header>
      <main id="marketing-content" tabIndex={-1}>
        <section className="front-hero">
          <Stack spacing={5}>
            <Typography variant="labelLarge">{t.eyebrow}</Typography>
            <Typography component="h1" variant="displaySmall" className="editorial-title">
              {t.hero}
            </Typography>
            <Typography variant="bodyLarge" sx={{ maxWidth: '40ch' }}>
              {t.intro}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 3 }}>
              <Button
                variant="contained"
                href="/explore/"
                endIcon={<ArrowUpRight aria-hidden size={20} />}
              >
                {t.find}
              </Button>
              <Button variant="outlined" href={businessUrl}>
                {t.business}
              </Button>
            </Stack>
          </Stack>
          <div className="scene-frame">
            <img
              src="/art/chalkboard.svg"
              alt=""
              width="600"
              height="600"
              fetchPriority="high"
              className="scene-static"
            />
            {scene && (
              <Suspense fallback={null}>
                <ChalkScene label={t.rotate} />
              </Suspense>
            )}
          </div>
        </section>
        <section className="front-block tonal" data-reveal>
          <Typography component="h2" variant="headlineLarge" className="section-title">
            {t.how}
          </Typography>
          <ol className="story-steps">
            {steps.map((step, i) => (
              <li key={step.title}>
                <div className="story-number" aria-hidden="true">
                  <step.icon size={28} />
                  {String(i + 1).padStart(2, '0')}
                </div>
                <Typography component="h3" variant="titleLarge">
                  {step.title}
                </Typography>
                <Typography variant="bodyLarge" sx={{ mt: 3 }}>
                  {step.body}
                </Typography>
              </li>
            ))}
          </ol>
          <div className="product-preview" aria-label={t.how}>
            <img src="/art/category-kopi.svg" alt="" width="180" height="180" loading="lazy" />
            <div>
              <Typography variant="labelLarge" translate="no">
                Chalkboard Business
              </Typography>
              <Typography variant="titleLarge" sx={{ my: 3 }}>
                {t.introduce}
              </Typography>
              <Typography variant="bodyMedium">{t.confirm}</Typography>
            </div>
          </div>
        </section>
        <section className="front-block two-columns" data-reveal>
          <Stack spacing={4}>
            <Typography component="h2" variant="headlineLarge" className="section-title">
              {t.fresh}
            </Typography>
            <Typography variant="bodyLarge">{t.freshBody}</Typography>
            <Button href="/explore/" variant="contained" sx={{ alignSelf: 'flex-start' }}>
              {t.find}
            </Button>
          </Stack>
          <div className="preview-tiles" aria-hidden="true">
            {['kopi', 'bakery', 'hawker', 'grocery'].map((category) => (
              <img
                key={category}
                src={`/art/category-${category}.svg`}
                width="200"
                height="200"
                loading="lazy"
                alt=""
              />
            ))}
          </div>
        </section>
        <section className="front-block tonal" data-reveal>
          <Typography component="h2" variant="headlineLarge" className="section-title">
            {t.languages}
          </Typography>
          <Typography variant="bodyLarge" sx={{ my: 5, maxWidth: '50ch' }}>
            {t.languagesBody}
          </Typography>
          <ul className="language-cloud">
            {LOCALES.map((locale) => (
              <li key={locale} lang={locale}>
                {LOCALE_NAMES[locale]}
              </li>
            ))}
          </ul>
        </section>
        <section className="front-block two-columns" data-reveal>
          <Typography component="h2" variant="headlineLarge" className="section-title">
            {t.trust}
          </Typography>
          <Typography variant="bodyLarge">{t.trustBody}</Typography>
        </section>
        <section className="front-block proof" data-reveal>
          <Typography component="h2" variant="headlineLarge">
            {t.proof}
          </Typography>
          <Typography variant="bodyLarge" sx={{ mt: 4, maxWidth: '60ch' }}>
            {t.proofBody}
          </Typography>
        </section>
      </main>
      <footer className="front-footer">
        <Typography variant="bodyMedium">{t.independent}</Typography>
        <Button href="/explore/">{t.find}</Button>
        <Button href={businessUrl}>{t.business}</Button>
      </footer>
    </Box>
  )
}
