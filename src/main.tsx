import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/google-sans-flex'
import '@fontsource-variable/roboto'
import Root from './app/Root'
import { AppProviders } from './app/AppProviders'
import { setupPwa } from './app/pwa'
import { canonicalCustomerPath, resolveApp } from './app/router'

const app = resolveApp(new URL(location.href))
if (app === 'customer') {
  const path = canonicalCustomerPath(location.pathname)
  if (path !== location.pathname)
    history.replaceState(null, '', path + location.search + location.hash)
}
setupPwa(app)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders business={app === 'business'}>
      <Root />
    </AppProviders>
  </StrictMode>,
)
