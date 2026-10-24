import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'
import { passportTranslations } from './copyLocales'
import type { LevelKey, Requirement } from './store'

/**
 * Passport, stamp moment and Today's 7 strings. English is the source; every supported locale
 * has a complete set in copyLocales.ts. Counts sit after a label ("Weekly streak: {n}") so no
 * language needs plural forms. Server cards carry facts, and these templates word them.
 */
export const passportStrings = {
  // Passport page
  title: 'Your passport',
  onThisPhone: 'On this phone',
  signInKeep: 'Sign in to keep your stamps on every device.',
  points: 'Points',
  demoPoints: 'Includes {n} demo points',
  demoPointsNote: 'Demo shops earn demo points, kept apart from real ones.',
  newcomer: 'Newcomer',
  regular: 'Regular',
  local_hero: 'Local Hero',
  levelLabel: 'Level: {level}',
  nextPoints: '{n} more points to {level}',
  nextShops: '{n} more shops to {level}',
  nextRepeat: 'Visit a shop again on another day to become a {level}',
  nextAreas: 'Stamp {n} more neighbourhood to become a {level}',
  nextRescues: '{n} more rescues or {m} helpful tips to {level}',
  topLevel: 'Your neighbourhood is better because you’re in it.',
  streak: 'Weekly streak: {n}',
  rainCheck: 'Rain check saved',
  rainHelp: 'A rain check covers one missed week. You earn one every 4 weeks.',
  newStreak: 'A new streak starts with your next visit.',
  weekRow: 'Last 8 weeks',
  weekDone: 'Visited',
  weekRain: 'Covered by a rain check',
  weekMissed: 'No visit',
  weekCurrent: 'This week',
  stampBook: 'Stamp book',
  emptyBook: 'Your first stamp is one QR away',
  emptyBookBody: 'Scan the QR at a shop’s counter. Stamps need you at the shop.',
  yourArea: 'Your area',
  demoArea: 'Demo area',
  stampsCount: 'Stamps: {n}',
  firstStamp: 'First try',
  rescueStamp: 'Rescue',
  tipStamp: 'Tip',
  quests: 'Quests',
  breakthrough: 'Weekly breakthrough',
  breakthroughBody: 'Any 3 verified visits this week',
  crawl: 'Breakfast crawl',
  crawlBody: '3 food stops, each before 10 am',
  rescueQuest: 'Rescue week',
  rescueQuestBody: 'Rescue 3 meals this week',
  makers: 'Makers and fixers',
  makersBody: '3 different non-food shops this month',
  festivalBody: 'Stamp {n} shops during the festival',
  deepavali: 'Deepavali light-up trail',
  diwali: 'Mithai and lights',
  vegetarian_festival: 'Yellow-flag trail',
  loy_krathong: 'Krathong makers',
  momiji: 'Momiji walk',
  hatsumode: 'Hatsumōde trail',
  chinese_new_year: 'Reunion pantry',
  pongal: 'Kite and harvest',
  ramadan: 'Ngabuburit takjil',
  questProgress: '{have} of {need}',
  questEnds: 'Until {date}',
  approximate: 'Festival dates are approximate.',
  questDone: 'Done',
  questReward: '+{n} points',
  stops: 'Stops nearby',
  impact: 'Rescued',
  meals: 'Meals rescued: {n}',
  co2: '≈ {kg} kg CO₂e kept out of the air',
  co2Note: 'An estimate from Too Good To Go’s published life-cycle study.',
  moneySaved: 'You saved {amount}',
  noRescues: 'No rescues yet. Most start around 6 pm.',
  perks: 'Perks unlocked',
  perkFrom: 'Offered by {shop}. Ask at the counter.',
  demoPerk: 'Demo perk',
  noPerks: 'Shops choose perks for Regulars, full cards and quest finales.',
  board: 'Regulars this week',
  boardJoin: 'Join the board',
  boardLeave: 'Leave the board',
  boardShares: 'Shows your first name and initial, level and points. Never where you went.',
  boardSignIn: 'Sign in to join the board.',
  boardEmpty: 'Nobody on the board yet this week.',
  boardHidden: 'Join to see names.',
  demo: 'Demo',
  failed: 'Your passport couldn’t load.',
  retry: 'Try again',
  // Stamp moment
  checking: 'Checking you’re at the shop…',
  stamped: 'Stamped!',
  firstTry: 'First try!',
  plus: '+{n} points',
  plusDemo: '+{n} demo points',
  tooFar: 'Stamps need you at the shop',
  tooFarBody: 'You look about {distance} away. Try again at the counter.',
  lowAccuracy: 'Your location is too rough right now',
  lowAccuracyBody: 'Step near a window or outside, then try again.',
  noLocation: 'Shop card stamped',
  noLocationBody: 'Turn on location for passport points.',
  already: 'Already stamped today',
  alreadyBody: 'Come back tomorrow for the next one.',
  dailyCap: 'That’s 6 stamps today',
  dailyCapBody: 'The passport takes up to 6 shops a day. More tomorrow!',
  tooFast: 'That was quick!',
  tooFastBody: 'Stamps this far apart need more time between them.',
  badKey: 'This QR is out of date',
  badKeyBody: 'Ask the shop to print its new QR.',
  ownShop: 'This is your own shop',
  ownShopBody: 'Owners don’t earn points at their own shop.',
  levelUp: 'You’re a {level} now!',
  questComplete: 'Quest complete!',
  milestone: 'Weekly streak: {n}!',
  done: 'Done',
  keptOnPhone: 'Kept on this phone. Sign in to keep it everywhere.',
  signIn: 'Sign in',
  stampFailed: 'The stamp didn’t go through. Check your connection.',
  collect: 'Collect your stamp',
  seePassport: 'See your Passport',
  keepBrowsing: 'Keep browsing',
  tryDemo: 'Try a demo stamp',
  tryDemoNote: 'Demo shop: its QR is shown on screen for this demo.',
  // Today's 7
  todayIn: 'Today near {area}',
  todayNear: 'Today near you',
  demoLabel: 'Sample neighbourhood · these are sample shops',
  cardOf: '{n} of {total}',
  sketching: 'Sketching your neighbourhood…',
  empty: 'Quiet here so far. Try a nearby area.',
  todayFailed: 'Today’s finds couldn’t load.',
  todayDone: 'That’s today’s {n}.',
  nextDrop: 'New finds at 7 am, in {time}',
  onlyOne: 'The only place within {km} km that sells {item}.',
  onlyOneProof: 'From {n} menus within {km} km',
  rescueHook: '{portions} × {item}, {pct}% off. {time} left.',
  rescueProof: 'Posted by the shop · pickup until {time}',
  gemProof: 'Nobody has written a tip about it yet',
  newItem: 'New on the menu: {item}.',
  priceDrop: '{item} is cheaper now: {price}, was {old}.',
  backInStock: '{item} is back in stock.',
  updateProof: 'From the shop’s menu · {when}',
  madeHere: 'Made right here, {distance} away.',
  madeHereProof: 'This {category} makes its own goods',
  festivalHook: '{festival}: {n} stops, on now.',
  festivalProof: 'Festival trail · until {date} (approximate dates)',
  tipProof: '{author} · neighbour tip',
  go: 'Go',
  hold: 'Hold one',
  save: 'Save',
  trail: 'Start trail',
  walk: '{n} min walk',
  sourceDemo: 'Demo',
  sourceChalkboard: 'Chalkboard',
  nav: 'Passport',
}

export type PassportStrings = typeof passportStrings

export function passportCopy(locale: Locale): PassportStrings {
  return locale === 'en' ? passportStrings : passportTranslations[locale]
}

export function usePassportCopy() {
  return passportCopy(useLocale())
}

/** Replace `{name}` placeholders. */
export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

/** The single next thing to do for the next level ("2 more shops to Regular"). */
export function requirementText(r: Requirement, level: LevelKey, t: PassportStrings) {
  const name = t[level]
  const left = Math.max(0, r.need - r.have)
  switch (r.key) {
    case 'points':
      return fill(t.nextPoints, { n: left, level: name })
    case 'shops':
      return fill(t.nextShops, { n: left, level: name })
    case 'repeat':
      return fill(t.nextRepeat, { level: name })
    case 'areas':
      return fill(t.nextAreas, { n: left, level: name })
    default:
      return fill(t.nextRescues, {
        n: left,
        m: Math.max(0, (r.alt_need ?? 0) - (r.alt_have ?? 0)),
        level: name,
      })
  }
}
