import type { Locale } from '../../i18n/locales.js'

export type Category = 'stock' | 'rent' | 'wages' | 'transport' | 'bills' | 'other'
export const CATEGORIES: Category[] = ['stock', 'rent', 'wages', 'transport', 'bills', 'other']

/**
 * Expenses and cash in hand, in the owner's words. English and Hindi are complete; the other
 * languages show English until translated (the close screen's own strings stay translated).
 */
export type MoneyCopy = {
  title: string
  sales: string
  salesNotYet: string
  spent: string
  left: string
  noExpenses: string
  add: string
  addTitle: string
  editTitle: string
  amount: (symbol: string) => string
  whatFor: string
  category: Record<Category, string>
  note: string
  paidBy: string
  cash: string
  upi: string
  date: string
  save: string
  cancel: string
  delete: string
  deleted: string
  undo: string
  failed: string
  amountExample: (example: string) => string
  amountQuestion: (a: string, b: string) => string
  edit: (what: string) => string
  /** The cash drawer. */
  drawer: string
  opening: string
  openingFrom: { today: string; yesterday: string; usual: string }
  openingAsk: (symbol: string) => string
  cashSales: string
  cashSpent: string
  expected: string
  upiSales: (symbol: string) => string
  split: string
  allCash: string
  counted: (symbol: string) => string
  saveCash: string
  short: (amount: string) => string
  extra: (amount: string) => string
  matches: string
  /** Home and the week. */
  homeSpent: (amount: string) => string
  homeLeft: (amount: string) => string
  week: string
  logOrder: (amount: string) => string
  logged: (amount: string) => string
}

const en: MoneyCopy = {
  title: 'Money today',
  sales: 'Sales',
  salesNotYet: 'Not closed yet',
  spent: 'Spent',
  left: 'Left after spending',
  noExpenses: 'No expenses noted today.',
  add: 'Add expense',
  addTitle: 'Add an expense',
  editTitle: 'Change expense',
  amount: (symbol) => `Amount (${symbol})`,
  whatFor: 'What for',
  category: {
    stock: 'Stock purchase',
    rent: 'Rent',
    wages: 'Wages',
    transport: 'Transport',
    bills: 'Bills',
    other: 'Other',
  },
  note: 'Note (optional)',
  paidBy: 'Paid by',
  cash: 'Cash',
  upi: 'UPI',
  date: 'Date',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  deleted: 'Expense deleted',
  undo: 'Undo',
  failed: 'Couldn’t save. Check your connection and try again.',
  amountExample: (example) => `Type the amount, like ${example}`,
  amountQuestion: (a, b) => `Did you mean ${a} or ${b}? Please type it again.`,
  edit: (what) => `Change ${what}`,
  drawer: 'Cash in the drawer',
  opening: 'Opening cash',
  openingFrom: {
    today: 'set today',
    yesterday: 'from last count',
    usual: 'your usual',
  },
  openingAsk: (symbol) => `Opening cash (${symbol})`,
  cashSales: '+ Cash sales',
  cashSpent: '− Paid in cash',
  expected: '= Should be in the drawer',
  upiSales: (symbol) => `Sales paid by UPI (${symbol})`,
  split: 'Split sales: cash and UPI',
  allCash: 'All sales counted as cash.',
  counted: (symbol) => `Cash you counted (${symbol})`,
  saveCash: 'Save cash',
  short: (amount) => `${amount} short`,
  extra: (amount) => `${amount} extra`,
  matches: 'Matches the drawer',
  homeSpent: (amount) => `spent ${amount}`,
  homeLeft: (amount) => `left ${amount}`,
  week: 'This week',
  logOrder: (amount) => `Note ${amount} as an expense`,
  logged: (amount) => `Noted ${amount} as an expense`,
}

const hi: MoneyCopy = {
  title: 'आज का हिसाब',
  sales: 'बिक्री',
  salesNotYet: 'अभी दिन बंद नहीं हुआ',
  spent: 'खर्चा',
  left: 'खर्चे के बाद बचा',
  noExpenses: 'आज कोई खर्चा नहीं लिखा।',
  add: 'खर्चा जोड़ें',
  addTitle: 'खर्चा जोड़ें',
  editTitle: 'खर्चा बदलें',
  amount: (symbol) => `रकम (${symbol})`,
  whatFor: 'किस लिए',
  category: {
    stock: 'माल ख़रीद',
    rent: 'किराया',
    wages: 'तनख्वाह',
    transport: 'आना-जाना',
    bills: 'बिल',
    other: 'दूसरा',
  },
  note: 'नोट (चाहें तो)',
  paidBy: 'कैसे दिया',
  cash: 'नकद',
  upi: 'यूपीआई',
  date: 'तारीख़',
  save: 'सेव करें',
  cancel: 'रहने दें',
  delete: 'हटाएँ',
  deleted: 'खर्चा हटाया',
  undo: 'वापस लाएँ',
  failed: 'सेव नहीं हुआ। इंटरनेट देखकर फिर कोशिश करें।',
  amountExample: (example) => `रकम लिखें, जैसे ${example}`,
  amountQuestion: (a, b) => `आपका मतलब ${a} था या ${b}? कृपया फिर से लिखें।`,
  edit: (what) => `${what} बदलें`,
  drawer: 'गल्ले में नकद',
  opening: 'शुरू का नकद',
  openingFrom: {
    today: 'आज लिखा',
    yesterday: 'पिछली गिनती से',
    usual: 'आपका रोज़ का',
  },
  openingAsk: (symbol) => `शुरू का नकद (${symbol})`,
  cashSales: '+ नकद बिक्री',
  cashSpent: '− नकद खर्चा',
  expected: '= गल्ले में होना चाहिए',
  upiSales: (symbol) => `यूपीआई से आई बिक्री (${symbol})`,
  split: 'बिक्री बाँटें: नकद और यूपीआई',
  allCash: 'सारी बिक्री नकद मानी गई।',
  counted: (symbol) => `गिना हुआ नकद (${symbol})`,
  saveCash: 'नकद सेव करें',
  short: (amount) => `${amount} कम`,
  extra: (amount) => `${amount} ज़्यादा`,
  matches: 'गल्ला पूरा मिला',
  homeSpent: (amount) => `खर्चा ${amount}`,
  homeLeft: (amount) => `बचा ${amount}`,
  week: 'इस हफ़्ते',
  logOrder: (amount) => `${amount} खर्चे में लिखें`,
  logged: (amount) => `${amount} खर्चे में लिखा`,
}

const copy: Partial<Record<Locale, MoneyCopy>> = { en, hi }

export function moneyCopyFor(locale: Locale): MoneyCopy {
  return copy[locale] ?? en
}
