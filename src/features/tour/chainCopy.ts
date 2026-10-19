import type { Locale } from '../../i18n/locales.js'

/** The tour's supply steps. Names and numbers always come from the seeded records (chainData). */
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
  loading: 'Loading the demo order…',
  failed: 'Couldn’t load the demo order. Take the tour again from You → Help.',
  forecast: 'Forecast from your sales',
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
  loading: 'डेमो ऑर्डर खुल रहा है…',
  failed: 'डेमो ऑर्डर नहीं खुला। आप → मदद से टूर फिर लें।',
  forecast: 'आपकी बिक्री से अनुमान',
}

/** English and Hindi; the other languages read the English story until translated. */
export function chainCopy(locale: Locale): ChainCopy {
  return locale === 'hi' ? hi : en
}
