import type { Locale } from '../../i18n/locales'

// The same rules as backend/app/reply_suggestions.py customer_language: the script first, then a
// few telling words for languages written in Latin letters. English when nothing else is clear.
const SCRIPTS: [Locale, RegExp][] = [
  ['hi', /[ऀ-ॿ]/],
  ['bn', /[ঀ-৿]/],
  ['ta', /[஀-௿]/],
  ['te', /[ఀ-౿]/],
  ['kn', /[ಀ-೿]/],
  ['th', /[฀-๿]/],
  ['ko', /[가-힯ᄀ-ᇿ]/],
  ['ja', /[ぁ-ヿ]/],
  ['zh-Hans', /[一-鿿]/],
]
const MARATHI = /आहे|आहेत|मिळेल|आहात|नाही का|हवे|हवा|पाहिजे/
const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/
const LATIN: [Locale, RegExp][] = [
  ['fil', /\b(?:po|meron|mayroon|magkano|ba kayo|salamat|bukas po|pwede)\b/],
  ['id', /\b(?:apakah|bisa|tidak|berapa harganya|terima kasih|kak|buka jam)\b/],
  ['ms', /\b(?:boleh|ada tak|tak|berapa|terima kasih|kedai|pukul berapa)\b/],
  ['hi', /\b(?:kya|hai|milega|milegi|chahiye|kitne ka|kitna|bhaiya|aap|kab)\b/],
]

/** The app locale a message is written in, by its script and a few telling words. */
export function messageLanguage(text: string): Locale {
  const plain = text.normalize('NFC').toLowerCase()
  for (const [locale, pattern] of SCRIPTS) {
    if (pattern.test(plain)) return locale === 'hi' && MARATHI.test(plain) ? 'mr' : locale
  }
  if (VIETNAMESE.test(plain)) return 'vi'
  return LATIN.find(([, pattern]) => pattern.test(plain))?.[0] ?? 'en'
}
