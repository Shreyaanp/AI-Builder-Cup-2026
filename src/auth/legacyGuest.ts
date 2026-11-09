import type { FirebaseOptions } from 'firebase/app'
import type { Auth } from 'firebase/auth'

type AppSdk = typeof import('firebase/app')
type AuthSdk = typeof import('firebase/auth')

/** The name every customer's session was saved under before separate sign-in (#335). */
export function legacyAppName(project: string | undefined) {
  return `ogoogle-web-${project}`
}

interface Restore {
  appSdk: AppSdk
  authSdk: AuthSdk
  auth: Auth
  config: FirebaseOptions
  /** Joins the old guest into a newer guest on the server; absent while that move is off. */
  merge?: (oldGuestToken: string) => Promise<unknown>
}

/**
 * OB-56: #335 renamed the Firebase app, so a guest's saved session was no longer found and they
 * silently became a new guest, away from their follows and stamps. Run before the first guest
 * is created: the old session carries over under the new name, keeping the same account, so
 * nothing on the server has to change. A phone that has already made a new guest has two
 * accounts, which only `merge` can join; until then the old session is left where it is.
 * Never throws: sign-in must work even if this does not.
 */
export async function restoreLegacyGuest({ appSdk, authSdk, auth, config, merge }: Restore) {
  const name = legacyAppName(config.projectId)
  const existing = appSdk.getApps().find((candidate) => candidate.name === name)
  const legacy = existing ?? appSdk.initializeApp(config, name)
  try {
    const old = authSdk.getAuth(legacy)
    await Promise.all([old.authStateReady(), auth.authStateReady()])
    const guest = old.currentUser
    // A Google account under the old name was never a guest, and may be the owner's.
    if (!guest?.isAnonymous) return
    const current = auth.currentUser
    if (!current) await authSdk.updateCurrentUser(auth, guest)
    else if (current.uid !== guest.uid) {
      if (!current.isAnonymous || !merge) return
      await merge(await guest.getIdToken())
    }
    // Only this browser's copy: the account itself and everything on it stay.
    await authSdk.signOut(old)
  } catch (error) {
    console.warn('Could not restore the earlier guest session', error)
  } finally {
    if (!existing) await appSdk.deleteApp(legacy).catch(() => undefined)
  }
}
