import type { AppSide } from './appSide'
import { hasSeen, preserveSeen } from '../features/first-run/seen'

function otherSideKey(key: string, side: AppSide) {
  const other = side === 'owner' ? 'customer' : 'owner'
  if (
    key.startsWith(`chalkboard.${other}.`) ||
    (other === 'owner' && key.startsWith('chalkboard.business.')) ||
    key.startsWith(`ogoogle-${other}-`) ||
    key.includes(`:ogoogle-${other}-`) ||
    key === `chalkboard.explainer.${other}.v1`
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
  // Both apps can run on localhost. Keep the other named Firebase app's records there.
  const sharedFirebase = name === 'firebaseLocalStorageDb'
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
          if (!sharedFirebase) objectStore.clear()
          else {
            const request = objectStore.openCursor()
            request.onsuccess = () => {
              const cursor = request.result
              if (!cursor) return
              const other = side === 'owner' ? 'customer' : 'owner'
              if (!String(cursor.key).includes(`:ogoogle-${other}-`)) cursor.delete()
              cursor.continue()
            }
          }
        }
      })
    if (sharedFirebase) {
      const remaining = await new Promise<number>((resolve, reject) => {
        if (!stores.length) return resolve(0)
        const request = db.transaction(stores[0]!).objectStore(stores[0]!).count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      if (remaining) return
    }
  } finally {
    db.close()
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    // Firebase can retain an open connection. Its stores are already empty; navigation
    // closes this document's connection and lets the pending deletion complete.
    request.onblocked = () => resolve()
  })
}

/** Erase this app's browser data before returning to its front door. */
export async function clearSession(side: AppSide) {
  // Device education is not account data and must survive sign-out/deletion.
  if (hasSeen(side)) preserveSeen(side)
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of Object.keys(storage)) {
      if (!otherSideKey(key, side)) storage.removeItem(key)
    }
  }
  const other = side === 'owner' ? 'customer' : 'owner'
  const tasks: Promise<unknown>[] = []
  if ('indexedDB' in window)
    tasks.push(
      indexedDB
        .databases()
        .then((databases) =>
          Promise.all(
            databases
              .filter((db) => db.name && !otherSideKey(db.name, side))
              .map((db) => clearDatabase(db.name!, side)),
          ),
        ),
    )
  if ('caches' in window)
    tasks.push(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) => !key.startsWith(`chalkboard-${other === 'owner' ? 'business' : other}-`),
              )
              .map((key) => caches.delete(key)),
          ),
        ),
    )
  if ('serviceWorker' in navigator)
    tasks.push(
      navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations
            .filter(
              (registration) =>
                new URL(registration.scope).pathname.startsWith('/explore/') ===
                (side === 'customer'),
            )
            .map(async (registration) => {
              const subscription = await registration.pushManager.getSubscription()
              if (subscription && !(await subscription.unsubscribe()))
                throw new Error('Push cleanup failed')
              await registration.unregister()
            }),
        ),
      ),
    )
  const results = await Promise.allSettled(tasks)
  if (results.some((result) => result.status === 'rejected'))
    throw new Error('Session cleanup failed')
}

export function frontDoor(side: AppSide) {
  location.replace(side === 'customer' ? '/explore/' : '/?app=business')
}
