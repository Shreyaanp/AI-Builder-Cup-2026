/** PWA helpers: service worker registration and a deferred install prompt. */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const DISMISSED = 'ogoogle.installDismissed'

export function setupPwa() {
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
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    })
  }
}

/** True when an install offer may be shown: installable, not installed, not declined before. */
export function canOfferInstall(): boolean {
  if (!deferred || matchMedia('(display-mode: standalone)').matches) return false
  try {
    return localStorage.getItem(DISMISSED) !== '1'
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
    localStorage.setItem(DISMISSED, '1')
  } catch {
    /* Offer may reappear next session. */
  }
}
