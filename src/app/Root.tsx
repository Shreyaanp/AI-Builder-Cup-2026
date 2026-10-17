import { lazy, Suspense } from 'react'
import { resolveApp } from './router'
import { BrandSplash } from '../features/frontdoors/Splash'

const App = lazy(() => import('./App'))
const V1App = lazy(() => import('../features/v1/V1App'))
const CustomerApp = lazy(() => import('../features/frontdoors/CustomerApp'))
const Marketing = lazy(() => import('../features/frontdoors/Marketing'))
const DemoApp = lazy(() => import('../features/demo/DemoApp'))

export default function Root() {
  if (/^\/(?:demo\/?|explore\/demo(?:\/.*)?)$/.test(location.pathname))
    return (
      <Suspense fallback={<BrandSplash business />}>
        <DemoApp />
      </Suspense>
    )
  const kind = resolveApp(new URL(location.href))
  if (kind === 'landing')
    return (
      <Suspense fallback={null}>
        <Marketing />
      </Suspense>
    )
  if (kind === 'customer') {
    return (
      <Suspense fallback={<BrandSplash />}>
        <CustomerApp />
      </Suspense>
    )
  }
  // The conversational V1 workspace is the product; ?classic=1 keeps the original starter.
  if (new URLSearchParams(location.search).get('classic') === '1')
    return (
      <Suspense fallback={<BrandSplash business />}>
        <App />
      </Suspense>
    )
  return (
    <Suspense fallback={<BrandSplash business />}>
      <V1App />
    </Suspense>
  )
}
