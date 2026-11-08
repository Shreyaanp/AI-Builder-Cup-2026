import { useLocale } from '../../state/hooks'

/**
 * Stock in plain sight (OB-310): "4 left" with − / + on every menu item, the "Things I buy" list
 * and "Make 20 more now?". Hindi and English are complete; other languages show English until
 * translated, like the make-or-buy copy (today/sourceCopy.ts).
 */
const WEEKDAYS_EN = [
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
  'Sundays',
]
const WEEKDAYS_HI = ['सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार', 'रविवार']

const en = {
  left: (n: number) => `${n} left`,
  soldOut: 'Sold out',
  // Gentle, not an alarm: below what usually sells today.
  low: 'Running low',
  less: (name: string) => `One less ${name}`,
  more: (name: string) => `One more ${name}`,
  stock: 'Stock',
  stockOf: (name: string) => `Stock of ${name}`,
  notCounted: 'Not counted',
  // The named note after a tap, with Undo.
  saved: (name: string, n: number) => (n === 0 ? `${name}: sold out` : `${name}: ${n} left`),
  undo: 'Undo',
  editTitle: (name: string) => `Edit ${name}`,
  forSale: 'Customers can buy this',
  forSaleHint: 'Off: it stays in Things I buy, never on your menu or customer page.',
  thingsIBuy: 'Things I buy',
  thingsIBuyHint: 'What you buy to make your menu. Customers never see these.',
  thingsIBuyCount: (n: number) => `${n} ${n === 1 ? 'thing' : 'things'}`,
  noThings: 'Nothing here yet. Tea dust, milk or flour you buy shows here.',
  edit: (name: string) => `Edit ${name}`,
  // Asked once for a bare supply name on the menu ("Paneer"); it stays on the menu until then.
  askForSale: (name: string) => `Do customers buy ${name} from you?`,
  askForSaleHint: 'It stays on your menu until you say.',
  yesSell: 'Yes, they do',
  noSell: 'No, I use it',
  buyStock: 'Buy stock',
  makeNow: (n: number) => `Make ${n} more now?`,
  usually: (n: number, weekday: number) => `Usually ${n} sell on ${WEEKDAYS_EN[weekday]}.`,
  howMany: 'How many more did you make?',
  made: (n: number) => `Made ${n}`,
  amount: 'How many',
  planTomorrow: 'Plan for tomorrow',
  notNow: 'Not now',
}

export type StockCopy = typeof en

const hi: StockCopy = {
  left: (n) => `${n} बचे`,
  soldOut: 'ख़त्म',
  low: 'कम बचे हैं',
  less: (name) => `${name} एक कम`,
  more: (name) => `${name} एक ज़्यादा`,
  stock: 'स्टॉक',
  stockOf: (name) => `${name} का स्टॉक`,
  notCounted: 'गिनती नहीं',
  saved: (name, n) => (n === 0 ? `${name}: ख़त्म` : `${name}: ${n} बचे`),
  undo: 'वापस लें',
  editTitle: (name) => `${name} बदलें`,
  forSale: 'ग्राहक इसे ख़रीद सकते हैं',
  // Neutral, not "मैं ख़रीदता हूँ": the owner's gender is never assumed.
  forSaleHint: 'बंद: यह "ख़रीदा हुआ सामान" में रहेगा, मेन्यू या ग्राहक पेज पर कभी नहीं।',
  thingsIBuy: 'ख़रीदा हुआ सामान',
  thingsIBuyHint: 'मेन्यू बनाने के लिए आप जो ख़रीदते हैं। ग्राहक इन्हें कभी नहीं देखते।',
  thingsIBuyCount: (n) => (n === 1 ? '1 चीज़' : `${n} चीज़ें`),
  noThings: 'अभी कुछ नहीं। चाय पत्ती, दूध या आटा जो आप ख़रीदते हैं, यहाँ दिखेगा।',
  edit: (name) => `${name} बदलें`,
  askForSale: (name) => `क्या ग्राहक आपसे ${name} ख़रीदते हैं?`,
  askForSaleHint: 'जब तक आप न बताएँ, यह मेन्यू पर रहेगा।',
  yesSell: 'हाँ, ख़रीदते हैं',
  noSell: 'नहीं, यहीं इस्तेमाल होता है',
  buyStock: 'माल मँगाएँ',
  makeNow: (n) => `अभी ${n} और बनाएँ?`,
  usually: (n, weekday) => `${WEEKDAYS_HI[weekday]} को आम तौर पर ${n} बिकते हैं।`,
  howMany: 'आपने कितने और बनाए?',
  made: (n) => `${n} बना दिए`,
  amount: 'कितने',
  planTomorrow: 'कल की तैयारी',
  notNow: 'अभी नहीं',
}

const tables: Record<string, StockCopy> = { en, hi }

export function useStockCopy(): StockCopy {
  return tables[useLocale().split('-')[0] ?? 'en'] ?? en
}

/** "Make 20 more now?": what usually sells today less what is left, to the nearest 5. */
export function makeAmount(left: number, usual: number | null | undefined): number {
  if (!usual) return 10
  return Math.max(5, Math.round((usual - left) / 5) * 5)
}
