import { useEffect, useState } from 'react'
import { Box, Button, IconButton, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import {
  Camera,
  Check,
  Coffee,
  Mic,
  Moon,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  ScanLine,
  Sun,
  Truck,
} from 'lucide-react'
import { visuallyHidden } from '@mui/utils'
import { chalkWrite, dealIn, stampThud } from '../../design/chalkMotion'
import { copy } from '../../design/copy'
import { HAND_FONT, layout, shape } from '../../design/theme'
import { LOCALE_NAMES } from '../../i18n/locales'
import { useLocale, usePreferencesDispatch } from '../../state/hooks'
import { useFrontCopy } from './strings'
import { useHowCopy, type HowCopy } from './howItWorksCopy'
import './how-it-works.css'

const starts = [0, 10, 18, 30]
const sceneAt = (second: number) => (second < 10 ? 0 : second < 18 ? 1 : second < 30 ? 2 : 3)

/** A local, silent storyboard: no camera, microphone, account or API access. */
export default function HowItWorks() {
  const t = useHowCopy()
  const front = useFrontCopy()
  const locale = useLocale()
  const dispatch = usePreferencesDispatch()
  const theme = useTheme()
  const r = theme.material
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true })
  const [second, setSecond] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [preview, setPreview] = useState(false)
  const [visible, setVisible] = useState(() => !document.hidden)
  const running = playing && !reduced && visible
  const scene = sceneAt(second)
  const phase = reduced || preview ? 12 : second - starts[scene]
  const captions = [t.start, t.reward, t.stock, t.import]

  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setSecond((value) => (value + 1) % 40), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  useEffect(() => {
    const previous = document.title
    document.title = `${t.title} · Chalkboard`
    return () => {
      document.title = previous
    }
  }, [t.title])

  const descriptions = [
    [t.speech, t.shop, t.near, t.chai, t.samosa, t.live],
    [t.scan, t.shop, t.stamp],
    [t.low, t.reorder, t.supplier, t.restocked],
    [t.photo, t.chai, t.samosa, t.items],
  ]
  return (
    <Box
      className="how-page"
      data-static={reduced || preview}
      sx={{
        '--how-surface': r.surfaceContainerLow,
        '--how-container': r.surfaceContainerHigh,
        '--how-ink': r.onSurface,
        '--how-muted': r.onSurfaceVariant,
        '--how-line': r.outlineVariant,
        '--how-accent': r.primaryContainer,
        '--how-on-accent': r.onPrimaryContainer,
        '--how-primary': r.primary,
        '--how-on-primary': r.onPrimary,
        '--how-radius': `${shape.lg}px`,
        '--how-phone-radius': `${shape.xl}px`,
        '--how-play-state': running ? 'running' : 'paused',
        maxWidth: layout.pageWidth,
        mx: 'auto',
        '& .how-enter': dealIn,
        '& .how-write': chalkWrite,
        '& .how-stamp': stampThud,
        '& .how-animated': { animationPlayState: 'var(--how-play-state)' },
      }}
    >
      <a className="skip-link" href="#how-main">
        {front.skip}
      </a>
      <Stack
        component="header"
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
      >
        <Typography
          component="a"
          href="/"
          variant="titleLarge"
          color="inherit"
          sx={{ textDecoration: 'none' }}
          translate="no"
        >
          Chalkboard
        </Typography>
        <Stack direction="row">
          <Button
            onClick={() => dispatch({ type: 'language', language: locale === 'hi' ? 'en' : 'hi' })}
          >
            {LOCALE_NAMES[locale === 'hi' ? 'en' : 'hi']}
          </Button>
          <IconButton
            aria-label={theme.palette.mode === 'dark' ? copy[locale].light : copy[locale].dark}
            onClick={() =>
              dispatch({
                type: 'appearance',
                appearance: theme.palette.mode === 'dark' ? 'light' : 'dark',
              })
            }
          >
            {theme.palette.mode === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </IconButton>
        </Stack>
      </Stack>
      <Box component="main" id="how-main" tabIndex={-1}>
        <Box className="how-heading">
          <Typography variant="headlineLarge" component="h1">
            {t.title}
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            {t.demo}
          </Typography>
        </Box>
        <Box className="how-layout">
          <Box component="figure" className="how-figure" sx={{ m: 0 }}>
            <div className="how-phone" aria-hidden="true" data-scene={scene} data-second={second}>
              <div className="how-speaker" />
              <div className="how-phone-top">
                <Coffee size={20} />
                <span>{scene === 2 ? t.today : t.shop}</span>
              </div>
              <PhoneScene key={scene} scene={scene} phase={phase} t={t} />
              <div className="how-home-line" />
            </div>
            <Typography component="figcaption" variant="titleLarge" className="how-caption">
              {captions[scene]}
            </Typography>
            <Box sx={visuallyHidden}>{descriptions[scene].join('. ')}</Box>
            <Stack
              direction="row"
              justifyContent="center"
              alignItems="center"
              gap={2}
              className="how-controls"
            >
              <Button
                variant="outlined"
                disabled={reduced}
                onClick={() => {
                  setPreview(false)
                  setPlaying((value) => !value)
                }}
                startIcon={
                  playing && !reduced ? (
                    <Pause aria-hidden size={18} />
                  ) : (
                    <Play aria-hidden size={18} />
                  )
                }
              >
                {playing && !reduced ? t.pause : t.play}
              </Button>
              <IconButton
                aria-label={t.replay}
                onClick={() => {
                  setPreview(false)
                  setSecond(0)
                  setPlaying(true)
                }}
              >
                <RotateCcw aria-hidden size={20} />
              </IconButton>
              <span className="how-time" aria-hidden="true">
                {String(second).padStart(2, '0')} / 40
              </span>
            </Stack>
            <Stack direction="row" justifyContent="center" component="nav" aria-label={t.title}>
              {captions.map((caption, index) => (
                <IconButton
                  key={caption}
                  aria-label={caption}
                  aria-current={scene === index ? 'step' : undefined}
                  onClick={() => {
                    setPreview(true)
                    setSecond(starts[index])
                    setPlaying(false)
                  }}
                >
                  <span className={`how-dot${scene === index ? ' how-dot-current' : ''}`} />
                </IconButton>
              ))}
            </Stack>
          </Box>
          <Stack component="section" className="how-next" aria-labelledby="how-next" gap={3}>
            <Typography
              id="how-next"
              variant="headlineSmall"
              component="h2"
              sx={{ fontFamily: HAND_FONT }}
            >
              {t.next}
            </Typography>
            <Button component="a" href="/explore" variant="contained">
              {front.find}
            </Button>
            <Button component="a" href="/?app=business" variant="outlined">
              {t.business}
            </Button>
            <Button component="a" href="/demo" variant="outlined">
              {t.try}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}

function PhoneScene({ scene, phase, t }: { scene: number; phase: number; t: HowCopy }) {
  const show = (at: number) => (phase >= at ? 'how-animated how-enter' : 'how-pending')
  return (
    <div className="how-screen">
      {scene === 0 && (
        <>
          <div className="how-speech">
            <Mic size={24} />
            <p>{t.speech}</p>
          </div>
          <div className={`how-shop ${show(2)}`}>
            <Coffee size={32} />
            <h2 className={phase >= 3 ? 'how-write how-animated' : 'how-pending'}>{t.shop}</h2>
            <p className={phase >= 4 ? 'how-write how-animated' : 'how-pending'}>{t.near}</p>
            <div className={`how-menu ${show(5)}`}>
              <span>{t.chai}</span>
              <span>{t.samosa}</span>
            </div>
          </div>
          <div className={`how-success ${show(7)}`}>
            <Check size={20} />
            <strong>{t.live}</strong>
            <QrCode size={64} />
          </div>
        </>
      )}
      {scene === 1 && (
        <>
          <div className="how-scanner">
            <QrCode size={120} />
            <ScanLine size={152} className={phase >= 2 ? 'how-scan-done' : ''} />
            <p>{t.scan}</p>
          </div>
          <div className={`how-shop ${show(3)}`}>
            <Coffee size={24} />
            <h2>{t.shop}</h2>
            <div className="how-stamps">
              {[0, 1, 2, 3].map((n) => (
                <span key={n} className="how-stamp-slot">
                  {n === 0 && phase >= 5 && <Check className="how-stamp how-animated" size={32} />}
                </span>
              ))}
            </div>
            <strong className={phase >= 5 ? '' : 'how-pending'}>{t.stamp}</strong>
          </div>
        </>
      )}
      {scene === 2 && (
        <>
          <div className="how-shop">
            <span className="how-milk">
              <Truck size={40} />
            </span>
            <h2>{t.low}</h2>
            <span className={`how-faux-button ${phase >= 3 ? 'how-ordered' : ''}`}>
              {phase >= 3 ? <Check size={18} /> : null}
              {t.reorder}
            </span>
          </div>
          <div className={`how-receipt ${show(5)}`}>
            <Truck size={24} />
            <strong>{t.supplier}</strong>
          </div>
          <div className={`how-success ${show(8)}`}>
            <Check size={36} />
            <h2>{t.restocked}</h2>
          </div>
        </>
      )}
      {scene === 3 && (
        <>
          <div className="how-camera">
            <div className={`how-pos ${phase >= 2 ? 'how-animated how-write' : ''}`}>
              <span>{t.chai}</span>
              <i />
              <span>{t.samosa}</span>
              <i />
            </div>
            <Camera size={32} />
            <p>{t.photo}</p>
          </div>
          <div className={`how-shop ${show(3)}`}>
            <div className={`how-item ${show(3)}`}>
              <Coffee size={24} />
              <span>{t.chai}</span>
              <Check size={20} />
            </div>
            <div className={`how-item ${show(5)}`}>
              <span className="how-samosa" />
              <span>{t.samosa}</span>
              <Check size={20} />
            </div>
          </div>
          <div className={`how-success ${show(7)}`}>
            <Check size={24} />
            <strong>{t.items}</strong>
          </div>
        </>
      )}
    </div>
  )
}
