import type { Locale } from '../../i18n/locales'

/** "1 day ahead for whole cakes": how far ahead an owner asks for pre-orders. */
const LEAD = /^\s*(\d+)\s*(hour|hours|day|days)\s+ahead(?:\s+for\s+(.+?))?\s*$/i

const words: Partial<
  Record<
    Locale,
    { hour: string; day: string; ahead: string; for: string; nouns: [string, string][] }
  >
> = {
  ta: {
    hour: 'மணி நேரம்',
    day: 'நாள்',
    ahead: 'முன்பே',
    for: 'இதற்கு:',
    nouns: [['whole cakes', 'முழு கேக்குகள்']],
  },
  hi: {
    hour: 'घंटे',
    day: 'दिन',
    ahead: 'पहले',
    for: 'इनके लिए:',
    nouns: [['whole cakes', 'पूरे केक']],
  },
}

/** The lead time in the customer's language. Wording it cannot read stays as the owner wrote it. */
export function leadTimeText(lead: string, locale: Locale): string {
  const match = LEAD.exec(lead)
  const set = words[locale]
  if (!match || !set) return lead
  const unit = match[2]!.toLowerCase().startsWith('hour') ? set.hour : set.day
  const noun = match[3]
    ? (set.nouns.find(([english]) => english === match[3]!.toLowerCase())?.[1] ?? match[3])
    : ''
  return `${match[1]} ${unit} ${set.ahead}${noun ? `, ${set.for} ${noun}` : ''}`
}
