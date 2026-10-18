import { Component, lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { resolveApp } from './router'
import { BrandSplash } from '../features/frontdoors/Splash'
import { FirstRun } from '../features/first-run/FirstRun'

const App = lazy(() => import('./App'))
const V1App = lazy(() => import('../features/v1/V1App'))
const CustomerApp = lazy(() => import('../features/frontdoors/CustomerApp'))
const Marketing = lazy(() => import('../features/frontdoors/Marketing'))
const HowItWorks = lazy(() => import('../features/frontdoors/HowItWorks'))
const DemoApp = lazy(() => import('../features/demo/DemoApp'))
const ArchitecturePage = lazy(() => import('../architecture/ArchitecturePage'))

/**
 * The customer front door. The server's LANDING_VARIANT decides between the one-story page and
 * the classic Marketing page, so a revert is one env-var change with no rebuild.
 */
function Landing() {
  // ?landing=classic|new previews either page without touching the server setting.
  const forced = new URLSearchParams(location.search).get('landing')
  const [variant, setVariant] = useState<'new' | 'classic' | null>(
    forced === 'classic' || forced === 'new' ? forced : null,
  )
  useEffect(() => {
    if (variant !== null) return
    const abort = new AbortController()
    void fetch('/api/v1/bootstrap', { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: { landing_variant?: string } | null) =>
        setVariant(config?.landing_variant === 'new' ? 'new' : 'classic'),
      )
      .catch(() => {
        if (!abort.signal.aborted) setVariant('classic')
      })
    return () => abort.abort()
  }, [variant])
  if (variant === null) return <BrandSplash />
  return (
    <Suspense fallback={<BrandSplash />}>
      {variant === 'classic' ? <Marketing /> : <HowItWorks front />}
    </Suspense>
  )
}

class LoadBoundary extends Component<
  { children: ReactNode; business?: boolean },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? (
      <BrandSplash business={this.props.business} failed />
    ) : (
      this.props.children
    )
  }
}

export default function Root() {
  if (/^\/(?:demo\/?|explore\/demo(?:\/.*)?)$/.test(location.pathname))
    return (
      <Suspense fallback={<BrandSplash business />}>
        <DemoApp />
      </Suspense>
    )
  // The judges' architecture page, on every host.
  if (/^\/architecture\/?$/.test(location.pathname))
    return (
      <LoadBoundary>
        <Suspense fallback={<BrandSplash />}>
          <ArchitecturePage />
        </Suspense>
      </LoadBoundary>
    )
  const kind = resolveApp(new URL(location.href))
  if (kind === 'pages')
    return (
      <Suspense fallback={<BrandSplash />}>
        <HowItWorks />
      </Suspense>
    )
  if (kind === 'landing') return <Landing />
  if (kind === 'customer') {
    return (
      <LoadBoundary>
        <Suspense fallback={<BrandSplash />}>
          <CustomerApp />
        </Suspense>
      </LoadBoundary>
    )
  }
  // The conversational V1 workspace is the product; ?classic=1 keeps the original starter.
  if (new URLSearchParams(location.search).get('classic') === '1')
    return (
      <LoadBoundary business>
        <Suspense fallback={<BrandSplash business />}>
          <App />
        </Suspense>
      </LoadBoundary>
    )
  return (
    <LoadBoundary business>
      <FirstRun app="owner">
        <Suspense fallback={<BrandSplash business />}>
          <V1App />
        </Suspense>
      </FirstRun>
    </LoadBoundary>
  )
}
