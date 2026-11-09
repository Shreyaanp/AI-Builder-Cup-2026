import type { Locale } from '../../i18n/locales'

/**
 * On an owner's real shop a made-up supplier says "Sample": it must never pass as real, but the
 * word "Demo" there made owners ask whether their own shop was a demo (Ahmed and Priya, 8 Nov).
 */
export const sampleWord: Record<Locale, string> = {
  en: 'Sample',
  'zh-Hans': '示例',
  ms: 'Contoh',
  ta: 'மாதிரி',
  ja: 'サンプル',
  ko: '예시',
  id: 'Contoh',
  th: 'ตัวอย่าง',
  vi: 'Mẫu',
  fil: 'Halimbawa',
  hi: 'नमूना',
  bn: 'নমুনা',
  te: 'నమూనా',
  mr: 'नमुना',
  kn: 'ಮಾದರಿ',
}
