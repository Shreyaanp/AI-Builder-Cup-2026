import type { AppSide } from './appSide'
import { hasSeen, preserveSeen } from '../features/first-run/seen'
import { leaveFarewell, type FarewellReason } from './farewellNote'

function otherSideKey(key: string, side: AppSide) {
  const other = side === 'owner' ? 'customer' : 'owner'
  if (
    key.startsWith(`chalkboard.${other}.`) ||
    (other === 'owner' && key.startsWith('chalkboard.business.')) ||
    key.startsWith(`ogoogle-${other}-`) ||
    key.includes(`:ogoogle-${other}-`) ||
    // The explainer marker is device education for both sides and survives sign-out.
    key.startsWith('chalkboard.explainer.')
  )
    return true
  // Existing customer-only caches predate the side prefix.
  return side === 'owner'
    ? /^(chalkboard\.(discover|passport|rescue|shopCache|ask|search|today|demoWorld)|ogoogle\.customer\.)/.test(
        key,
      )
    : /^(chalkboard\.(brief|cards|tour|freshness|closeday)|ogoogle\.speakReplies)/.test(key)
}

async function clearDatabase(name: string, side: AppSide) {
  // Firebase's own databases are shared with other open tabs and both apps on localhost. Their
  // connections have no versionchange handler, so a delete would block and queue behind every
  // later open. Only this side's entries are removed; the databases themselves stay.
  const firebaseOwned = name.startsWith('firebase')
  const other = side === 'owner' ? 'customer' : 'owner'
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    const stores = Array.from(db.objectStoreNames)
    if (stores.length)
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(stores, 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
        transaction.onerror = () => reject(transaction.error)
        for (const store of stores) {
          const objectStore = transaction.objectStore(store)
          if (!firebaseOwned) objectStore.clear()
          else {
            const request = objectStore.openCursor()
            request.onsuccess = () => {
              const cursor = request.result
              if (!cursor) return
              if (!String(cursor.key).includes(`ogoogle-${other}-`)) cursor.delete()
              cursor.continue()
            }
          }
        }
      })
  } finally {
    db.close()
  }
  if (firebaseOwned) return
  // Never wait: a blocked or failed delete leaves already-emptied stores, and navigation
  // closes this document's connections so a queued delete can finish by itself.
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

/** Best effort: a failing step is logged and never keeps the person on a signed-out page. */
async function step(label: string, run: () => Promise<unknown> | void) {
  try {
    await run()
  } catch (error) {
    console.warn(`Session cleanup: ${label} failed`, error)
  }
}

/** Erase this app's browser data before returning to its front door. Never throws. */
export async function clearSession(side: AppSide) {
  const other = side === 'owner' ? 'customer' : 'owner'
  await step('storage', () => {
    // Device education is not account data and must survive sign-out/deletion.
    if (hasSeen(side)) preserveSeen(side)
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (!otherSideKey(key, side)) storage.removeItem(key)
      }
    }
  })
  await Promise.all([
    step('databases', async () => {
      if (!('indexedDB' in window)) return
      const databases = await indexedDB.databases()
      await Promise.all(
        databases
          .filter((db) => db.name && !otherSideKey(db.name, side))
          .map((db) => step(`database ${db.name}`, () => clearDatabase(db.name!, side))),
      )
    }),
    step('caches', async () => {
      if (!('caches' in window)) return
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(`chalkboard-${other === 'owner' ? 'business' : other}-`))
          .map((key) => step(`cache ${key}`, () => caches.delete(key))),
      )
    }),
    step('service workers', async () => {
      if (!('serviceWorker' in navigator)) return
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations
          .filter(
            (registration) =>
              new URL(registration.scope).pathname.startsWith('/explore/') ===
              (side === 'customer'),
          )
          .map((registration) =>
            step('push and registration', async () => {
              const subscription = await registration.pushManager.getSubscription()
              if (subscription) await subscription.unsubscribe()
              await registration.unregister()
            }),
          ),
      )
    }),
  ])
}

export function frontDoor(side: AppSide, reason: FarewellReason = 'signed-out') {
  leaveFarewell(side, reason)
  location.replace(side === 'customer' ? '/explore/' : '/?app=business')
}
