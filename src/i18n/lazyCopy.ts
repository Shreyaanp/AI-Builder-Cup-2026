import { useEffect, useState } from 'react'
import { useLocale } from '../state/hooks'
import type { Locale } from './locales'

export type CopyLoaders<T> = Record<Exclude<Locale, 'en'>, () => Promise<T>>

/**
 * Per-locale copy loaded on demand: English ships with the module, every other language is its
 * own chunk fetched when the phone needs it. While a language is loading the hook keeps showing
 * the previous text (English on first paint), so keys never show and nothing flashes blank.
 */
export function lazyCopy<T>(english: T, loaders: CopyLoaders<T>) {
  const loaded = new Map<Locale, T>([['en', english]])
  const pending = new Map<Locale, Promise<T>>()

  function load(locale: Exclude<Locale, 'en'>): Promise<T> {
    let request = pending.get(locale)
    if (!request) {
      request = loaders[locale]().then((copy) => {
        loaded.set(locale, copy)
        return copy
      })
      pending.set(locale, request)
      // A failed fetch can be retried on the next render of that language.
      request.catch(() => pending.delete(locale))
    }
    return request
  }

  return function useLocaleCopy(): T {
    const locale = useLocale()
    const [shown, setShown] = useState<{ locale: Locale; copy: T }>(() => ({
      locale,
      copy: loaded.get(locale) ?? english,
    }))
    const ready = loaded.get(locale)
    useEffect(() => {
      if (locale === 'en' || loaded.has(locale)) return
      let live = true
      load(locale).then(
        (copy) => {
          if (live) setShown({ locale, copy })
        },
        () => undefined,
      )
      return () => {
        live = false
      }
    }, [locale])
    return ready ?? shown.copy
  }
}
