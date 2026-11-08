import type { Locale } from '../../i18n/locales'
import { closeDayApac } from './apacTranslations'
import { closeDayTranslations } from './translations'

/** Close the day. Languages without their own copy fall back to English. */
const en = {
  title: 'Close the day',
  tileValue: 'Snap today’s numbers',
  tileEvening: 'Ready to close today?',
  tileHint: 'Sales slip, deliveries and stock in a few photos. You check once.',
  intro:
    'Take a photo of each. Chalkboard reads them; you check everything once before it’s saved.',
  till: 'Sales slip or notebook',
  tillHint: 'Till slip or your sales notebook page',
  delivery: 'Deliveries received',
  deliveryHint: 'Supplier receipts or delivery notes: adds to your stock',
  count: 'Stock count',
  countHint: 'Your counted stock sheet: sets stock levels',
  reading: 'Reading…',
  readFailed: 'Couldn’t read',
  lines: '{n} lines',
  linesOne: '{n} line',
  review: 'Review ({n} lines)',
  reviewOne: 'Review ({n} line)',
  salesTitle: 'Today’s sales',
  stockTitle: 'Stock changes',
  readAs: 'Read as “{text}”',
  notOnMenu: 'Not on your menu: skipped',
  remove: 'Remove',
  fixture: 'These lines are samples from your own items, not read from the photo.',
  back: 'Add more',
  reviewEmpty:
    'Nothing to save yet: we could not read items with quantities. Add a clearer, flat photo of the report.',
  save: 'Close the day',
  saving: 'Saving…',
  saveFailed: 'Couldn’t finish saving. Please try again.',
  savedState: 'Saved',
  notSavedState: 'Not saved',
  unknownState: 'Save not confirmed; retry safely',
  doneTitle: 'Day closed',
  doneSales: 'Sales of {sales} saved.',
  doneStock: 'Stock updated for {n} items.',
  donePlan: 'Your prep plan will use these numbers from now on.',
  thanks: 'Thank you for today. Rest well.',
  bestSeller: 'Best seller: {item} ({n})',
  soldOf: 'You sold {n} {item}.',
  // The close screen's reward (HABIT change 3): only facts from saved records.
  doneTotal: 'Day closed: {sales}',
  moreThan: '{amount} more than {when}',
  lessThan: 'A quieter day than {when}. Tomorrow is a fresh start.',
  sameAs: 'Same as {when}',
  lastWeekday: 'last {weekday}',
  forecastSold: 'Forecast said about {forecast} {item}. You sold {sold}.',
  finish: 'Done',
  close: 'Not now',
  early: 'It’s still early. Close anyway?',
  earlyWhy: 'You can edit today’s numbers later.',
  anyway: 'Close anyway',
  wholeDay: 'This is the whole day',
  alreadyClosed: 'Already closed today: {sales}',
  edit: 'Edit',
  soldItems: 'You sold {n} items.',
  soldItemsOne: 'You sold {n} item.',
  soldWhat: 'You sold {what}.',
  countItems: '{n} items',
  countItemsOne: '{n} item',
  loading: 'Checking today’s sales…',
  loadFailed: 'Couldn’t check today’s sales. Please try again.',
  retry: 'Try again',
  numberInvalid: 'Number not clear. Try {example}.',
}

type Copy = typeof en

const translations: Partial<Record<Locale, Partial<Copy>>> = {
  ...closeDayTranslations,
  ...closeDayApac,
}

const numberErrors: Record<Locale, string> = {
  en: en.numberInvalid,
  'zh-Hans': '数字不清楚，请按 {example} 的格式填写。',
  ms: 'Nombor tidak jelas. Cuba {example}.',
  ta: 'எண் தெளிவாக இல்லை. {example} போல எழுதவும்.',
  ja: '数値を確認し、{example} のように入力してください。',
  ko: '숫자를 확인하고 {example}처럼 입력해 주세요.',
  id: 'Angka tidak jelas. Coba {example}.',
  th: 'ตัวเลขไม่ชัดเจน ลองกรอกแบบ {example}',
  vi: 'Số chưa rõ. Hãy nhập như {example}.',
  fil: 'Hindi malinaw ang numero. Subukan ang {example}.',
  hi: 'संख्या साफ़ नहीं है। {example} की तरह लिखें।',
  bn: 'সংখ্যা স্পষ্ট নয়। {example} এর মতো লিখুন।',
  te: 'సంఖ్య స్పష్టంగా లేదు. {example} లాగా రాయండి.',
  mr: 'संख्या स्पष्ट नाही. {example} प्रमाणे लिहा.',
  kn: 'ಸಂಖ್ಯೆ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ. {example} ಹಾಗೆ ಬರೆಯಿರಿ.',
}

export function closeDayCopy(locale: Locale): Copy {
  return { ...en, ...(translations[locale] ?? {}), numberInvalid: numberErrors[locale] }
}

export function closeDayCount(
  locale: Locale,
  key: 'review' | 'lines' | 'soldItems' | 'countItems',
  n: number,
) {
  const t = closeDayCopy(locale)
  const pattern = new Intl.PluralRules(locale).select(n) === 'one' ? t[`${key}One`] : t[key]
  return pattern.replace('{n}', new Intl.NumberFormat(locale).format(n))
}
