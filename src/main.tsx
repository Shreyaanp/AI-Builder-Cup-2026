import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/roboto'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-500.css'
import '@fontsource/noto-sans-devanagari/devanagari-600.css'
import Root from './app/Root'
import { AppProviders } from './app/AppProviders'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <Root />
    </AppProviders>
  </StrictMode>,
)
