import { useLocale } from '../../state/hooks'

/**
 * Opening, comparing and saving a supplier (OB-223, OB-265). Hindi and English are complete; other
 * languages show English until translated, like the supply screens' copy.
 */
const en = {
  cheapest: 'Cheapest',
  nearest: 'Nearest',
  saved: 'Saved',
  save: 'Save as my supplier',
  remove: 'Remove from my suppliers',
  compare: 'Compare',
  hideCompare: 'Hide comparison',
  supplier: 'Supplier',
  price: 'Price',
  distance: 'Distance',
  packNote: (price: string, unit: string, size: string) => `${price} a ${unit} of ${size}`,
  noSize: 'Pack size not listed',
  open: (name: string) => `Open ${name}`,
  sells: 'What they sell',
  minOrder: 'Minimum order',
  delivery: 'Delivery',
  away: (km: string) => `${km} km away`,
  isSaved: (name: string) => `${name} is on My suppliers.`,
  isRemoved: (name: string) => `${name} is off My suppliers.`,
  failed: 'That did not work. Try again.',
}

const hi: typeof en = {
  cheapest: 'सबसे सस्ता',
  nearest: 'सबसे पास',
  saved: 'जोड़ा हुआ',
  save: 'मेरे सप्लायर में जोड़ें',
  remove: 'मेरे सप्लायर से हटाएँ',
  compare: 'तुलना करें',
  hideCompare: 'तुलना छिपाएँ',
  supplier: 'सप्लायर',
  price: 'दाम',
  distance: 'दूरी',
  packNote: (price, _unit, size) => `${size} का पैक ${price}`,
  noSize: 'पैक का साइज़ नहीं लिखा',
  open: (name) => `${name} खोलें`,
  sells: 'क्या-क्या बेचते हैं',
  minOrder: 'कम से कम ऑर्डर',
  delivery: 'डिलीवरी',
  away: (km) => `${km} किमी दूर`,
  isSaved: (name) => `${name} मेरे सप्लायर में जुड़ गया।`,
  isRemoved: (name) => `${name} मेरे सप्लायर से हट गया।`,
  failed: 'नहीं हो पाया। फिर से कोशिश करें।',
}

/** Units as a Hindi tap says them; the coach reads these words (instant_supply SPOKEN_UNITS). */
export const HINDI_TAP_UNITS: Record<string, string> = { litre: 'लीटर', kg: 'किलो', g: 'ग्राम' }

export function useSupplierCopy() {
  return useLocale() === 'hi' ? hi : en
}
