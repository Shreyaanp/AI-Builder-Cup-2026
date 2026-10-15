import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'
import { rescueTranslations } from './locales'

/**
 * Customer rescue strings (the Rescue tab, Hold one for me, collecting at the counter). English
 * is the source; every supported locale has a complete set in locales.ts. Counts sit after a
 * label ("Left: {n}") so no language needs plural forms. The impact meter reuses the passport's.
 */
export const rescueStrings = {
  nav: 'Rescue',
  title: 'Rescue',
  lead: 'Leftovers from shops near {place}, at closing time.',
  here: 'your location',
  useLocation: 'Use my location',
  locating: 'Finding you…',
  mapLabel: 'Map of rescues around you',
  you: 'You',
  pin: '{shop}: {item}, ends in {time}',
  loading: 'Looking for leftovers nearby…',
  empty: 'No rescues near you right now. Most start around 6 pm. Follow shops to hear first.',
  failed: 'Couldn’t load rescues.',
  retry: 'Try again',
  offline: 'You’re offline. Holding needs a connection.',
  listTitle: 'Ending soon',
  portions: '{n} × {item}',
  left: 'Left: {n}',
  off: '{pct}% off',
  was: 'Was {price}',
  endsIn: 'Ends in {time}',
  ended: 'Ended',
  away: '{distance} away',
  demo: 'Demo rescue',
  hold: 'Hold one for me',
  held: 'Held',
  holdTitle: 'Hold a rescue',
  holdBody: 'This message goes to {shop} in your chat. No payment here: you pay at the counter.',
  holdMessage: 'Hi! Could you hold {qty} × {item} from your rescue for pickup by {time}?',
  howMany: 'How many',
  fewer: 'Fewer',
  more: 'More',
  whichItem: 'Which item',
  send: 'Send to the shop',
  cancel: 'Cancel',
  heldUntil: 'Held until {time}. Show this chat at the counter.',
  openChat: 'Open chat',
  done: 'Done',
  gone: 'Gone. The good news: someone rescued them.',
  holdFailed: 'Couldn’t hold it. Try again.',
  signInTitle: 'Sign in to hold a rescue',
  signInBody: 'Holds go through your chat with the shop, so the owner knows who is coming.',
  holdsTitle: 'Your holds',
  collectHint: 'At the counter, scan the shop’s QR code to collect your rescue stamp.',
  impact: 'Your impact',
  rescued: 'Rescued!',
  rescuedBody: 'Meals you kept out of the bin: {n}',
  pickupNote: 'From the shop: {note}',
}

export type RescueStrings = typeof rescueStrings

export function rescueCopy(locale: Locale): RescueStrings {
  return locale === 'en' ? rescueStrings : (rescueTranslations[locale] ?? rescueStrings)
}

export function useRescueCopy() {
  return rescueCopy(useLocale())
}
