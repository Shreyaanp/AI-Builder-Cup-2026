import type { Locale } from '../../../i18n/locales'
import type { Copy } from '../strings'
import { zhHans } from './zh-Hans'
import { ms } from './ms'
import { ta } from './ta'
import { ja } from './ja'
import { ko } from './ko'
import { id } from './id'
import { th } from './th'
import { vi } from './vi'
import { fil } from './fil'

/** Complete APAC owner copy; English is supplied by strings.ts. */
export const translations: Record<Exclude<Locale, 'en'>, Copy> = {
  'zh-Hans': zhHans,
  ms: ms,
  ta: ta,
  ja: ja,
  ko: ko,
  id: id,
  th: th,
  vi: vi,
  fil: fil,
}
