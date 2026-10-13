import { lazy, Suspense } from 'react'
import App from './App'

const V1App = lazy(() => import('../features/v1/V1App'))

export default function Root() {
  // The conversational V1 workspace is the product; ?classic=1 keeps the original starter.
  if (new URLSearchParams(location.search).get('classic') === '1') return <App />
  return (
    <Suspense fallback={<div role="status">Preparing your conversation…</div>}>
      <V1App />
    </Suspense>
  )
}
