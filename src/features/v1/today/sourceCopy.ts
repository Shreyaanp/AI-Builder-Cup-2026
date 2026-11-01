import { useLocale } from '../../../state/hooks'

/**
 * Made or bought (OB-239): only stock the shop buys gets an Order button. Something it makes
 * gets "Make more"; an item the app cannot tell about asks once. Hindi and English are complete;
 * other languages show English until translated, like the supply screens' copy.
 */
const en = {
  ask: (item: string, left: number) => `${item}: only ${left} left. Do you make it or buy it?`,
  // No item to save the answer on here: the owner answers in the menu (OB-243).
  askInMenu: (item: string, left: number) =>
    `${item}: only ${left} left. Do you make it or buy it? Choose in Shop › Menu.`,
  // The menu item editor's control: the same saved answer, changeable any time.
  question: 'Do you make it or buy it?',
  make: 'Make',
  buy: 'Buy',
  // The editor saves the answer on the tap (OB-243).
  saved: 'Saved',
  makeLabel: (item: string) => `I make ${item}`,
  buyLabel: (item: string) => `I buy ${item}`,
  makeMore: 'Make more',
  // The coach answers with the prep plan for the item.
  makeDraft: (item: string) => `How many ${item} should I prep for tomorrow?`,
}

export type SourceCopy = typeof en

const hi: SourceCopy = {
  ask: (item, left) => `${item}: सिर्फ़ ${left} बचे। आप इसे बनाते हैं या खरीदते हैं?`,
  askInMenu: (item, left) =>
    `${item}: सिर्फ़ ${left} बचे। आप इसे बनाते हैं या खरीदते हैं? दुकान › मेन्यू में चुनें।`,
  question: 'आप इसे बनाते हैं या खरीदते हैं?',
  make: 'बनाते हैं',
  buy: 'खरीदते हैं',
  saved: 'सेव हो गया',
  makeLabel: (item) => `${item}: बनाते हैं`,
  buyLabel: (item) => `${item}: खरीदते हैं`,
  makeMore: 'और बनाएँ',
  makeDraft: (item) => `कल के लिए कितने ${item} तैयार करूँ?`,
}

const tables: Record<string, SourceCopy> = { en, hi }

export function useSourceCopy(): SourceCopy {
  return tables[useLocale()] ?? en
}
