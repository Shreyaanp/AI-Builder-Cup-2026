import type { Locale } from '../../i18n/locales'
import { closeDayApac } from './apacTranslations'
import { closeDayTranslations } from './translations'

/** Close the day. Languages without their own copy fall back to English. */
const en = {
  title: 'Close the day',
  tileValue: 'Snap today’s numbers',
  tileEvening: 'Ready to close today?',
  tileHint: 'Till report, deliveries and stock in a few photos. You check once.',
  intro:
    'Take a photo of each. Chalkboard reads them; you check everything once before it’s saved.',
  till: 'Till or POS report',
  tillHint: 'Z report, sales slip or your sales notebook page',
  delivery: 'Deliveries received',
  deliveryHint: 'Supplier receipts or delivery notes: adds to your stock',
  count: 'Stock count',
  countHint: 'Your counted stock sheet: sets stock levels',
  reading: 'Reading…',
  readFailed: 'Couldn’t read',
  lines: '{n} lines',
  review: 'Review ({n} lines)',
  salesTitle: 'Today’s sales',
  stockTitle: 'Stock changes',
  readAs: 'Read as “{text}”',
  notOnMenu: 'Not on your menu: skipped',
  remove: 'Remove',
  fixture:
    'Offline mode: these lines are sample data from your own items, not read from the photo.',
  back: 'Add more',
  save: 'Save day',
  saving: 'Saving…',
  saveFailed: 'Couldn’t save. Nothing changed; please try again.',
  doneTitle: 'Day closed',
  doneSales: 'Sales of {sales} saved.',
  doneStock: 'Stock updated for {n} items.',
  donePlan: 'Your prep plan uses them from now on.',
  finish: 'Done',
  close: 'Close',
}

type Copy = typeof en

const translations: Partial<Record<Locale, Partial<Copy>>> = {
  ...closeDayTranslations,
  ...closeDayApac,
}

export function closeDayCopy(locale: Locale): Copy {
  return { ...en, ...(translations[locale] ?? {}) }
}
