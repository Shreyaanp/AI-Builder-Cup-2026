import type { Locale } from './locales'

/**
 * Script fonts load on demand: English users never download CJK/Thai/Tamil fonts.
 * Latin, Malay, Indonesian, Vietnamese and Filipino are covered by Google Sans Flex / Roboto.
 */
const loaders: Partial<Record<Locale, () => Promise<unknown>>> = {
  'zh-Hans': () => import('@fontsource/noto-sans-sc/400.css'),
  ja: () => import('@fontsource/noto-sans-jp/400.css'),
  ko: () => import('@fontsource/noto-sans-kr/400.css'),
  th: () => import('@fontsource/noto-sans-thai/400.css'),
  ta: () => import('@fontsource/noto-sans-tamil/400.css'),
  hi: () => import('./scripts/devanagari.css'),
  mr: () => import('./scripts/devanagari.css'),
  bn: () => import('./scripts/bengali.css'),
  te: () => import('./scripts/telugu.css'),
  kn: () => import('./scripts/kannada.css'),
}

export async function loadScriptFont(locale: Locale): Promise<void> {
  try {
    await loaders[locale]?.()
  } catch {
    /* System fonts still render the script if the font chunk fails to load. */
  }
}

/** Font stack: brand font first, then script fonts (used per glyph once loaded). */
export const FONT_STACK = [
  '"Google Sans Flex Variable"',
  '"Roboto Variable"',
  '"Noto Sans SC"',
  '"Noto Sans JP"',
  '"Noto Sans KR"',
  '"Noto Sans Thai"',
  '"Noto Sans Tamil"',
  '"Noto Sans Devanagari"',
  '"Noto Sans Bengali"',
  '"Noto Sans Telugu"',
  '"Noto Sans Kannada"',
  '"Nirmala UI"',
  'system-ui',
  'sans-serif',
].join(', ')
