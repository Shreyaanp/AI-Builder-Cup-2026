import { useEffect } from 'react'
import type { Locale } from '../../i18n/locales'
import type { Api } from './api'

/** The server's id for this phone's push subscription (sha-256 of its endpoint). */
export async function subscriptionId(subscription: PushSubscription): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(subscription.endpoint),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function pushSupported() {
  return (
    window.isSecureContext &&
    'Notification' in window &&
    'PushManager' in window &&
    'serviceWorker' in navigator
  )
}

/**
 * Reminders speak the app's language: when it changes (You → Language, or asking the coach),
 * this phone's reminder is re-worded at once. Also checked on start, in case the last change
 * happened offline. Nothing happens on a phone without reminders.
 */
export function useReminderLanguage(api: Api, locale: Locale, ready: boolean) {
  useEffect(() => {
    if (!ready || !pushSupported()) return
    let cancelled = false
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (!subscription || cancelled) return
      const sid = await subscriptionId(subscription)
      if (cancelled) return
      await api(`/reminders/${sid}/locale`, { method: 'PUT', body: JSON.stringify({ locale }) })
    })().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api, locale, ready])
}
