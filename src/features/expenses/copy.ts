import type { Locale } from '../../i18n/locales.js'
import { categoryCopy } from './copyCategories'
import { moreMoneyCopy } from './copyMore'

export type Category = 'stock' | 'rent' | 'wages' | 'transport' | 'bills' | 'other'
export const CATEGORIES: Category[] = ['stock', 'rent', 'wages', 'transport', 'bills', 'other']

/** Expenses and cash in hand, in the owner's words, in every app language. */
export type MoneyText = {
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
  deleteFailed: string
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
  /** In place of the expected figure until the day's sales are saved. */
  expectedLater: string
  /** A count is saved but the day's sales are not: why no short or extra yet. */
  afterSales: string
  upiFromTotal: (amount: string) => string
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

export type MoneyCopy = MoneyText & { category: Record<Category, string> }

const en: MoneyText = {
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
  deleteFailed: 'Couldn’t delete. Check your connection and try again.',
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
  expectedLater: 'After today’s sales',
  afterSales: 'Short or extra shows after you save today’s sales.',
  upiFromTotal: (amount) => `${amount} by UPI, saved with today’s total.`,
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

const copy: Record<Locale, MoneyText> = { en, ...moreMoneyCopy }

export function moneyCopyFor(locale: Locale): MoneyCopy {
  return { ...copy[locale], category: categoryCopy[locale] }
}
