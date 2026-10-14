import { lazy, Suspense } from 'react'
import App from './App'

const V1App = lazy(() => import('../features/v1/V1App'))
const PublicShop = lazy(() => import('../features/public/PublicShop'))
const Discover = lazy(() => import('../features/discover/Discover'))

const fallback = <div role="status">Loading…</div>

export default function Root() {
  if (/^\/discover\/?$/.test(location.pathname))
    return (
      <Suspense fallback={fallback}>
        <Discover />
      </Suspense>
    )
  // Customer page: /s/<shop id>, public and read-only.
  const sharedId = /^\/s\/([0-9a-f-]{36})\/?$/i.exec(location.pathname)?.[1]
  if (sharedId)
    return (
      <Suspense fallback={fallback}>
        <PublicShop id={sharedId} />
      </Suspense>
    )
  // The conversational V1 workspace is the product; ?classic=1 keeps the original starter.
  if (new URLSearchParams(location.search).get('classic') === '1') return <App />
  return (
    <Suspense fallback={fallback}>
      <V1App />
    </Suspense>
  )
}
