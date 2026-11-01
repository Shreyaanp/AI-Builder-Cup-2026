import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'
import { ownerTranslations } from './locales'

/**
 * Owner strings for closing-time rescue, the morning brief and the unmet-demand radar. English
 * is the source; every supported locale has a complete set in locales.ts. Counts sit after a
 * label ("Left: {n}") so no language needs plural forms.
 */
export const ownerStrings = {
  // Rescue
  rescue: 'Rescue',
  rescueIdle: 'Leftovers?',
  rescueIdleHint: 'Send a closing-time deal',
  rescueLive: 'Live · {time}',
  rescueLiveHint: 'Left: {left} of {qty}',
  rescueTitle: 'Closing-time rescue',
  liveNow: 'Live now',
  endsIn: 'Ends in {time}',
  heldLeft: 'Held: {held} · Left: {left}',
  endEarly: 'End early',
  ended: 'Rescue ended',
  earlier: 'Earlier today',
  finished: 'Finished',
  newRescue: 'New rescue',
  likelyLeft: 'Likely left today',
  estimateNote: 'An estimate from your forecast and today’s sales. Check what is really left.',
  noEstimate:
    'No estimate yet: it needs sales history and closing hours. Choose the items yourself.',
  addItem: 'Add an item',
  remove: 'Remove {item}',
  fewer: 'Fewer {item}',
  more: 'More {item}',
  qty: 'Portions of {item}',
  discount: 'Discount',
  off: '{pct}% off',
  until: 'Pickup until',
  priceLine: '{was} → {price}',
  note: 'Note for customers (optional)',
  send: 'Send rescue',
  sendHint:
    'Shows on the rescue map and to your followers. Customers hold portions in chat. No payments.',
  sent: 'Rescue sent',
  needHours: 'Save your closing hours first to send a rescue.',
  changed: 'Something changed. Check and send again.',
  pickTime: 'Pick a time later today, no later than closing.',
  demo: 'Demo',
  // Morning brief
  brief: 'Morning brief',
  slide: 'Slide {n} of {total}',
  hide: 'Hide for today',
  prep: 'Prep today',
  prepRange: 'Range {lower}–{upper}',
  noPrep: 'Close one day to start your prep plan.',
  weather: 'Weather',
  rain: 'Chance of rain: {pct}%',
  weatherCredit: 'Weather data by {source}',
  weatherDemoCredit: 'Sample weather for the demo.',
  lowStock: 'Running low',
  stockLeft: 'Left: {n}',
  runsOut: 'Runs out {date}',
  noLowStock: 'Nothing is running low.',
  best: 'Best thing to do today',
  act_reply: 'Customers waiting for a reply: {n}',
  act_order: 'Order {item} now',
  act_radar: 'Add {item} to your menu?',
  act_reduce_prep: 'Prep {n} fewer {item}',
  act_confirm_menu: 'Confirm today’s menu',
  act_record_sales: 'Close one day to start your plan',
  act_none: 'Your shop is up to date',
  go_reply: 'Open messages',
  go_order: 'Ask the coach',
  go_radar: 'See ideas',
  go_confirm_menu: 'Open menu',
  orderDraft: 'Find a supplier for {item}',
  // Unmet-demand radar
  radar: 'Asked nearby',
  ideas: 'Ideas: {n}',
  noIdeas: 'None yet',
  radarScope: 'Last {days} days · within {km} km of {area}',
  radarScopeApprox: 'Last {days} days · within {km} km of your shop (approximate area)',
  band: 'People who asked: {band}',
  unmet: 'No shop nearby lists it',
  google: 'Google lists places nearby: {n}',
  fits: 'Fits your shop',
  other: 'Other category',
  radarEmpty: 'Not enough asks nearby yet. An idea shows once 5 different people ask.',
  radarPrivacy: 'Counts are rounded into bands. We never keep what people typed or who asked.',
  addToMenu: 'Add to my menu',
  addDraft: 'Add {item} to my menu',
  demoActivity: 'Demo activity',
  holdRequest: 'Rescue hold: {n} × {item}',
  // Shared
  loadFailed: 'Couldn’t load this.',
  retry: 'Try again',
}

export type OwnerStrings = typeof ownerStrings

export function ownerCopy(locale: Locale): OwnerStrings {
  return locale === 'en' ? ownerStrings : ownerTranslations[locale]
}

export function useOwnerCopy() {
  return ownerCopy(useLocale())
}

/** Replace `{name}` placeholders. */
export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}
