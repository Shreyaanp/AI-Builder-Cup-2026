import type { Locale } from '../../i18n/locales.js'

/** The tour's order story. Names and numbers always come from the seeded records (chainData). */
const en = {
  today: {
    title: (item: string, day: string) => `${item} runs out ${day}`,
    body: (left: string, daily: string) => `${left} left, about ${daily} a day, from your sales.`,
  },
  order: {
    title: 'The AI drafts the order',
    body: (supplier: string, items: number, total: string) =>
      `WhatsApp to ${supplier}: ${items} items, ${total}. You send it.`,
  },
  wholesaler: {
    title: 'It lands at the wholesaler',
    body: (distributor: string) => `Restocks from ${distributor} by CSV.`,
  },
  chain: {
    title: 'A big chain does it in SAP',
    body: (chain: string, outlets: string) =>
      `${chain}, ${outlets} outlets: the same order, confirmation, shipping notice and invoice.`,
  },
  arrived: {
    title: 'Goods arrive',
    body: (item: string, before: string, after: string, day: string) =>
      `${item}: ${before} → ${after}. Covered until ${day}.`,
  },
  customers: {
    title: 'Customers come back',
    body: (stamps: number, needed: number, reward: string) =>
      `${stamps} stamps today. At ${needed} stamps: ${reward}.`,
  },
  loading: 'Loading the demo order…',
  failed: 'Couldn’t load the demo order. Take the tour again from You → Help.',
  left: 'left',
  perDay: 'a day',
  forecast: 'Forecast from your sales',
  to: (name: string) => `To ${name}`,
  from: (name: string) => `From ${name}`,
  whatsapp: 'WhatsApp',
  total: 'Total',
  incoming: 'Order coming in',
  ownOrder: 'Its own order',
  sameItems: (n: number) => `Same ${n} items as your WhatsApp order`,
  spreadsheet: 'Spreadsheet (CSV) by email',
  outlets: (n: string) => `${n} outlets`,
  orderTo: (number: string, name: string) => `Order ${number} to ${name}`,
  sap: 'SAP',
  runsOut: (day: string) => `Would run out ${day}`,
  covered: (day: string) => `Covered until ${day}`,
  stampsToday: 'stamps today',
  cameBack: 'came back today',
  stampCard: (needed: number, reward: string) => `${needed} stamps: ${reward}`,
  demo: 'Demo only: nothing was sent.',
}

export type ChainCopy = typeof en

const hi: ChainCopy = {
  today: {
    title: (item, day) => `${item} ${day} को ख़त्म होगा`,
    body: (left, daily) => `${left} बचा है, रोज़ लगभग ${daily}। आपकी बिक्री से।`,
  },
  order: {
    title: 'AI ऑर्डर तैयार करता है',
    body: (supplier, items, total) =>
      `${supplier} को WhatsApp: ${items} चीज़ें, ${total}। भेजते आप हैं।`,
  },
  wholesaler: {
    title: 'ऑर्डर थोक व्यापारी तक',
    body: (distributor) => `${distributor} से CSV पर मँगाता है।`,
  },
  chain: {
    title: 'बड़ी चेन यही SAP में करती है',
    body: (chain, outlets) =>
      `${chain}, ${outlets} आउटलेट: वही ऑर्डर, पुष्टि, शिपिंग सूचना और बिल।`,
  },
  arrived: {
    title: 'माल आ गया',
    body: (item, before, after, day) => `${item}: ${before} → ${after}। ${day} तक काफ़ी।`,
  },
  customers: {
    title: 'ग्राहक लौटकर आते हैं',
    body: (stamps, needed, reward) => `आज ${stamps} स्टैम्प। ${needed} स्टैम्प पर: ${reward}।`,
  },
  loading: 'डेमो ऑर्डर खुल रहा है…',
  failed: 'डेमो ऑर्डर नहीं खुला। आप → मदद से टूर फिर लें।',
  left: 'बचा',
  perDay: 'रोज़',
  forecast: 'आपकी बिक्री से अनुमान',
  to: (name) => `${name} को`,
  from: (name) => `${name} से`,
  whatsapp: 'WhatsApp',
  total: 'कुल',
  incoming: 'आता हुआ ऑर्डर',
  ownOrder: 'उसका अपना ऑर्डर',
  sameItems: (n) => `आपके WhatsApp ऑर्डर वाली वही ${n} चीज़ें`,
  spreadsheet: 'ईमेल पर स्प्रेडशीट (CSV)',
  outlets: (n) => `${n} आउटलेट`,
  orderTo: (number, name) => `ऑर्डर ${number}, ${name} को`,
  sap: 'SAP',
  runsOut: (day) => `${day} को ख़त्म होता`,
  covered: (day) => `${day} तक काफ़ी`,
  stampsToday: 'आज के स्टैम्प',
  cameBack: 'आज लौटकर आए',
  stampCard: (needed, reward) => `${needed} स्टैम्प: ${reward}`,
  demo: 'सिर्फ़ डेमो: कुछ भेजा नहीं गया।',
}

/** English and Hindi; the other languages read the English story until translated. */
export function chainCopy(locale: Locale): ChainCopy {
  return locale === 'hi' ? hi : en
}
