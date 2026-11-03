/** Unfinished setup belongs to this account and this tab, never device preferences.
 * Session cleanup erases owner-prefixed data on sign-out; closing the tab erases it too.
 * This cache recovers unsent edits. The server remains the saved-shop authority.
 */
const key = (scope: string, part: string) => `chalkboard.owner.onboarding.v1:${scope}:${part}`

export function readOnboardingDraft<T>(scope: string, part: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key(scope, part)) ?? 'null') as T | null
  } catch {
    return null
  }
}

export function saveOnboardingDraft(scope: string, part: string, value: unknown) {
  try {
    sessionStorage.setItem(key(scope, part), JSON.stringify(value))
  } catch {
    // Storage can be unavailable. Keep the mounted form usable.
  }
}

export function clearOnboardingDraft(scope: string) {
  clearOnboardingPhoto(scope)
  clearOnboardingPhoto(scope, 'camera')
  try {
    for (const part of ['chat', 'manual']) sessionStorage.removeItem(key(scope, part))
  } catch {
    // Best effort, matching account session cleanup.
  }
}

/** Blob recovery is separate from the small text draft. No data URLs or credentials.
 * A tab holds its random lookup id; owner sign-out erases the database. Expired orphan
 * files (tabs closed without finishing) are removed when the store is next opened.
 */
async function photoStore(
  id: string,
  action: 'read' | 'write' | 'delete',
  file?: File,
): Promise<File | null> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chalkboard.owner.onboarding', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('photos')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<File | null>((resolve, reject) => {
        const transaction = db.transaction('photos', 'readwrite')
        const store = transaction.objectStore('photos')
        let result: File | null = null
        const request = store.get(id)
        request.onsuccess = () => {
          const saved = request.result as { file: File; at: number } | undefined
          if (action === 'write') store.put({ file, at: Date.now() }, id)
          else if (action === 'delete') store.delete(id)
          else if (saved && Date.now() - saved.at < 86_400_000) result = saved.file
        }
        const cursor = store.openCursor()
        cursor.onsuccess = () => {
          const row = cursor.result
          if (!row) return
          if (Date.now() - (row.value as { at: number }).at >= 86_400_000) row.delete()
          row.continue()
        }
        transaction.oncomplete = () => resolve(result)
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function saveOnboardingPhoto(
  scope: string,
  file: File,
  slot: 'photo' | 'camera' = 'photo',
) {
  const id = readOnboardingDraft<string>(scope, `${slot}-id`) ?? crypto.randomUUID()
  saveOnboardingDraft(scope, `${slot}-id`, id)
  await photoStore(`${scope}:${id}`, 'write', file)
}

export async function loadOnboardingPhoto(scope: string, slot: 'photo' | 'camera' = 'photo') {
  const id = readOnboardingDraft<string>(scope, `${slot}-id`)
  return id ? photoStore(`${scope}:${id}`, 'read') : null
}

export function clearOnboardingPhoto(scope: string, slot: 'photo' | 'camera' = 'photo') {
  const id = readOnboardingDraft<string>(scope, `${slot}-id`)
  try {
    sessionStorage.removeItem(key(scope, `${slot}-id`))
  } catch {
    // A denied store must not prevent camera recovery actions.
  }
  if (id) void photoStore(`${scope}:${id}`, 'delete')
}
