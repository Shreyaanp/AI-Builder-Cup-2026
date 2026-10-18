import type { AccountStrings } from '../features/customer/copy'
import type { StoryCopy } from '../features/frontdoors/strings'
import type { PassportStrings } from '../features/passport/copy'
import type { RescueStrings } from '../features/rescue/copy'
import type { Locale } from './locales'

/**
 * One language's front-door and customer copy (packs/<locale>.ts). English ships with each
 * feature; every other language is its own chunk, fetched before the app paints in it
 * (main.tsx) and before a language change shows (AppProviders), so the copy helpers stay
 * synchronous and never show half-translated screens.
 */
export type LocalePack = {
  /** Front-door rows, positional in the order of frontEnglish's keys. */
  front: string[]
  story: StoryCopy
  /** Demo banner rows, positional in the order of demoEnglish's keys. */
  demo: string[]
  account: AccountStrings
  rescue: RescueStrings
  passport: PassportStrings
}

type Translated = Exclude<Locale, 'en'>

const loaders: Record<Translated, () => Promise<LocalePack>> = {
  hi: () => import('./packs/hi').then((m) => m.pack),
  bn: () => import('./packs/bn').then((m) => m.pack),
  te: () => import('./packs/te').then((m) => m.pack),
  mr: () => import('./packs/mr').then((m) => m.pack),
  kn: () => import('./packs/kn').then((m) => m.pack),
  ta: () => import('./packs/ta').then((m) => m.pack),
  'zh-Hans': () => import('./packs/zh-Hans').then((m) => m.pack),
  ms: () => import('./packs/ms').then((m) => m.pack),
  ja: () => import('./packs/ja').then((m) => m.pack),
  ko: () => import('./packs/ko').then((m) => m.pack),
  id: () => import('./packs/id').then((m) => m.pack),
  th: () => import('./packs/th').then((m) => m.pack),
  vi: () => import('./packs/vi').then((m) => m.pack),
  fil: () => import('./packs/fil').then((m) => m.pack),
}

const loaded = new Map<Locale, LocalePack>()
const pending = new Map<Locale, Promise<void>>()

/** The loaded pack for a language; undefined for English or while it is still loading. */
export function localePack(locale: Locale): LocalePack | undefined {
  return loaded.get(locale)
}

export function packReady(locale: Locale): boolean {
  return locale === 'en' || loaded.has(locale)
}

/** Resolves once the language can be shown; a failed fetch resolves too (English shows). */
export function loadPack(locale: Locale): Promise<void> {
  if (packReady(locale)) return Promise.resolve()
  let request = pending.get(locale)
  if (!request) {
    request = loaders[locale as Translated]().then(
      (pack) => void loaded.set(locale, pack),
      () => void pending.delete(locale), // retried on the next change to that language
    )
    pending.set(locale, request)
  }
  return request
}
