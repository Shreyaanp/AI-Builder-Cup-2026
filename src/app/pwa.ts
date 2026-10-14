/** PWA helpers: service worker registration and a deferred install prompt. */
import type { AppKind } from './router'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let dismissedKey = 'chalkboard.business.installDismissed'

export function setupPwa(app: AppKind) {
  document.querySelector('link[rel="manifest"]')?.remove()
  if (app === 'landing') return
  dismissedKey = `chalkboard.${app}.installDismissed`
  const manifest = document.createElement('link')
  manifest.rel = 'manifest'
  manifest.href =
    app === 'customer' ? '/explore/manifest.webmanifest' : '/manifest-business.webmanifest'
  document.head.appendChild(manifest)
  // Chrome fires this when the app is installable; keep it until the owner has made progress.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const worker = app === 'customer' ? '/explore/sw.js' : '/sw.js'
      void navigator.serviceWorker
        .register(worker, { scope: app === 'customer' ? '/explore/' : '/' })
        .catch(() => undefined)
    })
  }
}

/** True when an install offer may be shown: installable, not installed, not declined before. */
export function canOfferInstall(): boolean {
  if (!deferred || matchMedia('(display-mode: standalone)').matches) return false
  try {
    return localStorage.getItem(dismissedKey) !== '1'
  } catch {
    return true
  }
}

export async function offerInstall(): Promise<void> {
  const event = deferred
  if (!event) return
  deferred = null
  await event.prompt()
  const choice = await event.userChoice
  if (choice.outcome === 'dismissed') rememberInstallDeclined()
}

export function rememberInstallDeclined() {
  try {
    localStorage.setItem(dismissedKey, '1')
  } catch {
    /* Offer may reappear next session. */
  }
}
