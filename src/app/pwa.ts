/** PWA helpers: service worker registration and a deferred install prompt. */
import type { AppKind } from './router'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let dismissedKey = 'chalkboard.business.installDismissed'
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Settings can offer installation even when the progress banner was declined. */
export function installState(): 'installed' | 'prompt' | 'ios' | 'unavailable' {
  const navigatorIos = navigator as Navigator & { standalone?: boolean }
  if (installed || navigatorIos.standalone || matchMedia('(display-mode: standalone)').matches)
    return 'installed'
  if (deferred) return 'prompt'
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari =
    /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)
  return ios && safari ? 'ios' : 'unavailable'
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setupPwa(app: AppKind) {
  document.querySelector('link[rel="manifest"]')?.remove()
  if (app === 'landing' || app === 'pages') return
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
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
  matchMedia('(display-mode: standalone)').addEventListener('change', notify)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const worker = app === 'customer' ? '/explore/sw.js' : '/sw.js'
      void navigator.serviceWorker
        .register(worker, { scope: app === 'customer' ? '/explore/' : '/' })
        .then(() => (app === 'customer' ? keepLoadedFiles() : undefined))
        .catch(() => undefined)
    })
  }
}

/** A-18: the first visit loads its code before the worker takes over, so it never passed through
 * the worker's cache. Hand the worker that list once it is active, so the screens and art shown
 * so far open offline too. */
async function keepLoadedFiles() {
  const registration = await navigator.serviceWorker.ready
  const urls = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => {
      const url = new URL(name, location.origin)
      return url.origin === location.origin && /^\/(?:assets|art|icons)\//.test(url.pathname)
    })
  registration.active?.postMessage({ type: 'keep', urls })
}

/** True when an install offer may be shown: installable, not installed, not declined before. */
export function canOfferInstall(): boolean {
  if (installState() !== 'prompt') return false
  try {
    return localStorage.getItem(dismissedKey) !== '1'
  } catch {
    return true
  }
}

export async function offerInstall(): Promise<void> {
  const event = deferred
  if (!event || installState() === 'installed') return
  deferred = null
  notify()
  await event.prompt()
  const choice = await event.userChoice
  if (choice.outcome === 'accepted') installed = true
  if (choice.outcome === 'dismissed') rememberInstallDeclined()
  notify()
}

export function rememberInstallDeclined() {
  try {
    localStorage.setItem(dismissedKey, '1')
  } catch {
    /* Offer may reappear next session. */
  }
}
