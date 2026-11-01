import { useLocale } from '../../state/hooks'

/** The demo supplier's side of the conversation (OB-248). Written here, so no AI is involved. */
const en = {
  heading: (name: string) => `Chat with ${name}`,
  waiting: (name: string) => `Waiting for ${name} to reply…`,
  ask: (list: string, day: string) =>
    day ? `Please send ${list} by ${day}.` : `Please send ${list}.`,
  yes: (list: string, day: string) =>
    day ? `Yes, ${list} is confirmed. It reaches you ${day}.` : `Yes, ${list} is confirmed.`,
  short: (now: string, item: string, later: string, day: string) =>
    `I have only ${now} ${item} today. The other ${later} comes ${day}. Is that OK?`,
  dearer: (item: string, now: string, was: string, unit: string) =>
    `${item} has gone up: ${now} a ${unit} now, it was ${was}. Is that OK?`,
  okay: 'OK, go ahead.',
  onWay: (day: string) =>
    day ? `Your order is on the way. It reaches you ${day}.` : 'Your order is on the way.',
  gotIt: 'The goods came, thank you.',
  bill: (total: string) => `Here is the bill: ${total}. Thank you!`,
}

type SupplierTalkCopy = typeof en

const hi: SupplierTalkCopy = {
  heading: (name) => `${name} से बात`,
  waiting: (name) => `${name} के जवाब का इंतज़ार…`,
  ask: (list, day) => (day ? `कृपया ${list} ${day} तक भेज दीजिए।` : `कृपया ${list} भेज दीजिए।`),
  yes: (list, day) =>
    day ? `जी, ${list} पक्का है। ${day} तक पहुँच जाएगा।` : `जी, ${list} पक्का है।`,
  short: (now, item, later, day) =>
    `आज मेरे पास सिर्फ़ ${now} ${item} है। बाकी ${later} ${day} को आएगा। ठीक है?`,
  dearer: (item, now, was, unit) =>
    `${item} का दाम बढ़ गया है: अब ${now} प्रति ${unit}, पहले ${was} था। ठीक है?`,
  okay: 'ठीक है, भेज दीजिए।',
  onWay: (day) =>
    day ? `आपका ऑर्डर निकल चुका है। ${day} तक पहुँचेगा।` : 'आपका ऑर्डर निकल चुका है।',
  gotIt: 'सामान मिल गया, धन्यवाद।',
  bill: (total) => `यह रहा बिल: ${total}। धन्यवाद!`,
}

export function useSupplierTalkCopy(): SupplierTalkCopy {
  return useLocale() === 'hi' ? hi : en
}
