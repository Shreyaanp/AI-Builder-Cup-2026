import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/google-sans-flex'
import '@fontsource-variable/roboto'
import Root from './app/Root'
import { AppProviders } from './app/AppProviders'
import { setupPwa } from './app/pwa'

setupPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Root />
    </AppProviders>
  </StrictMode>,
)
