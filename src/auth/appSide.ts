import { resolveApp } from '../app/router'

export type AppSide = 'owner' | 'customer'

export function appSide(): AppSide {
  return resolveApp(new URL(location.href)) === 'customer' ? 'customer' : 'owner'
}

/** Firebase includes the app name in its persistence and cross-tab notification keys. */
export function firebaseAppName(side: AppSide, project: string | undefined) {
  if (!project) throw new Error('Sign-in is not configured yet.')
  return `ogoogle-${side}-${project}`
}

export function sideKey(key: string) {
  return `chalkboard.${appSide()}.${key}`
}
