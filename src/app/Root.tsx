import { Component, lazy, Suspense } from 'react'
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
  if (kind === 'landing')
    return (
      <Suspense fallback={null}>
        <Marketing />
      </Suspense>
    )
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
