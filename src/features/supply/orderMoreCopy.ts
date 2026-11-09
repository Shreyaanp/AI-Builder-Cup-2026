import { useLocale } from '../../state/hooks'

/**
 * Order more (persona runs, 8 Nov): how much, the Buy stock box and changing the amount on the
 * card. Hindi and English are complete; other languages show English until translated, like the
 * supply screens' copy.
 */
const en = {
  howMuch: (item: string) => `How much ${item}?`,
  suggested: (amount: string) => `Suggested: ${amount}`,
  amount: 'Amount',
  unit: 'Unit',
  seeOrder: 'See the order',
  enterAmount: 'Enter an amount above zero.',
  boxExample: 'Like: butter, 2 kg',
  say: 'Say what you need',
  listening: 'Listening…',
  notUnderstood: 'Say the item and how much, like: butter, 2 kg.',
  refused: 'Okay, nothing ordered.',
  changeAmount: 'Change amount',
  draftsReady: (n: number) => `${n} orders are ready in To do.`,
  cannotSell: (supplier: string, item: string, amount: string) =>
    `${supplier} can’t sell that amount of ${item}. The nearest it sells is ${amount}. Nothing was drafted.`,
  noUnits: 'Those units don’t convert. Pick one from the list.',
}

const hi: typeof en = {
  howMuch: (item) => `${item} कितना चाहिए?`,
  suggested: (amount) => `सुझाव: ${amount}`,
  amount: 'मात्रा',
  unit: 'इकाई',
  seeOrder: 'ऑर्डर देखें',
  enterAmount: 'शून्य से ज़्यादा मात्रा लिखें।',
  boxExample: 'जैसे: मक्खन, 2 किलो',
  say: 'बोलकर बताएँ',
  listening: 'सुन रहे हैं…',
  notUnderstood: 'सामान और मात्रा बताएँ, जैसे: मक्खन, 2 किलो।',
  refused: 'ठीक है, कुछ नहीं मँगाया।',
  changeAmount: 'मात्रा बदलें',
  draftsReady: (n) => `${n} ऑर्डर "करना है" में तैयार हैं।`,
  cannotSell: (supplier, item, amount) =>
    `${supplier} ${item} इतनी मात्रा में नहीं बेचता। सबसे पास ${amount} है। कोई ऑर्डर नहीं बना।`,
  noUnits: 'ये इकाइयाँ नहीं बदल सकतीं। सूची से चुनें।',
}

export function useOrderMoreCopy() {
  return useLocale().startsWith('hi') ? hi : en
}
