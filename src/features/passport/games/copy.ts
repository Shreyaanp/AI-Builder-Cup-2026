import type { Locale } from '../../../i18n/locales'
import { useLocale } from '../../../state/hooks'
import { gamesTranslations } from './copyLocales'

/**
 * Game layer strings (scratch cards, welcome stamps, streak freezes, collection sets, the
 * neighbourhood goal, shop thank-yous). English is the source; every supported locale has a
 * complete set in copyLocales.ts. Counts sit after a label ("Freezes: {n}") so no language
 * needs plural forms.
 */
export const gamesStrings = {
  howItWorks: 'How it works',
  howItWorksFor: 'How it works: {title}',
  gotIt: 'Got it',
  step: 'Step {n}',
  // The next named reward
  nextReward: 'Next reward',
  nextCard: '{n} more stamps → {reward}',
  nextCardOne: '{n} more stamp → {reward}',
  nextCardReady: 'Ready to claim: {reward}',
  nextCardAt: 'At {shop}',
  nextSet: '{n} more stops → {set} badge',
  // Scratch cards
  scratchTitle: 'Scratch card',
  scratchWaiting: 'Scratch cards waiting: {n}',
  scratchFrom: 'Earned at {shop}',
  scratchHint: 'Scratch with your finger or mouse',
  scratchHere: 'Scratch here',
  scratchReveal: 'Reveal',
  scratchNext: 'Next card',
  scratchArea: 'Scratch card from {shop}. Drag to scratch, or press Reveal.',
  scratchFailed: 'The card didn’t open. Check your connection and try again.',
  retry: 'Try again',
  prize_points_10: '+10 bonus points',
  prize_points_25: '+25 bonus points',
  prize_perk: 'You won: {perk}',
  prize_freeze: 'A streak freeze!',
  prize_again: 'Not this time',
  prizeBody_points: 'Added to your passport.',
  prizeBody_perk: 'Show it at {shop}. It’s saved under Prizes.',
  prizeBody_freeze: 'It keeps your weekly streak safe through a missed week.',
  prizeBody_again: 'Your stamp still counts. Every verified stamp brings a new card tomorrow.',
  demoPrize: 'Demo prize',
  odds: 'See the odds',
  oddsTitle: 'The odds',
  odds_points_10: '+10 points',
  odds_points_25: '+25 points',
  odds_perk: 'A perk from the shop',
  odds_freeze: 'A streak freeze',
  odds_again: 'Try again tomorrow',
  oddsFirst: 'Your very first card always wins +25 points.',
  oddsNote:
    'Each card is picked by chance the moment you earn it. Cards only come from verified stamps, never from money, and points never expire.',
  signInScratch: 'Signed-in neighbours get a scratch card with every stamp.',
  // Welcome stamps (endowed progress)
  welcomeStamps: 'Welcome stamps on us: {n}',
  welcomeStamp: 'Welcome stamp',
  // Streak
  streakFlame: 'Weekly streak',
  weeksLabel: 'weeks',
  freezes: 'Freezes: {n}',
  freezeNext: 'Freeze next week',
  freezeThis: 'Freeze this week',
  freezeNextDone: 'Next week is frozen. Enjoy the break!',
  freezeThisDone: 'This week is frozen. Your streak is safe.',
  freezeNone: 'No freezes left. You earn one every 4 active weeks.',
  freezeFailed: 'That didn’t save. Try again.',
  freezeSignIn: 'Sign in to keep freezes for your streak.',
  nudge: 'Keep your streak going: a stamp at any shop this week counts, or use a freeze.',
  weekFrozen: 'Frozen',
  weekCovered: 'Covered by a freeze',
  // Collection sets
  setsTitle: 'Collection sets',
  chai_trail: 'Chai trail',
  chai_trailBody: '4 different tea or coffee spots',
  locally_made: 'Locally made',
  locally_madeBody: '3 shops that make what they sell',
  night_market: 'Night market',
  night_marketBody: '3 food stops after 6 pm',
  festivalTrail: 'Festival trail',
  setReward: 'Badge + {n} points + the shop’s set perk',
  setDone: 'Set complete!',
  setComplete: 'Set complete: {set}!',
  setStops: 'Stops nearby',
  setEnds: 'Until {date} (approximate)',
  // Neighbourhood goal (co-op)
  coopTitle: 'Neighbourhood goal',
  coopGoal: '{goal} visits in {area} this week',
  coopGoalHere: '{goal} visits around here this week',
  coopReward: 'Everyone who helps gets +{n} points when the street gets there together.',
  coopProgress: '{total} of {goal} visits',
  coopYou: 'Your visits: {n}',
  coopHelpers: 'Neighbours helping: {n}',
  coopDemo: 'Includes {n} visits from demo neighbours',
  coopReached: 'Goal reached! Thank you, neighbour.',
  coopClaim: 'Collect +{n} points',
  coopClaimed: 'Collected. Thank you!',
  coopEnds: 'Until {date}',
  coopJoin: 'Stamp any shop in the area to help.',
  coopHelped: 'You helped the neighbourhood goal: {total} of {goal}',
  coopFailed: 'That didn’t go through. Try again.',
  // Social proof and shop thank-yous (reciprocity)
  tried: 'Neighbours who tried this in 30 days: {n}',
  perksHere: 'Thank-yous from this shop',
  trigger_regular: 'When you become a Regular',
  trigger_full_card: 'When your card is full',
  trigger_quest_finale: 'When you finish a quest here',
  trigger_rescue_hero: 'After 3 rescues here',
  trigger_third_visit: 'On your third visit',
  trigger_tip: 'When you leave a tip',
  trigger_follow: 'When you follow and visit',
  trigger_scratch: 'A scratch-card prize',
  trigger_set_complete: 'When you finish a set here',
  // Won prizes
  wonPerks: 'Prizes you won',
  wonFrom: 'From {shop}. Show it at the counter.',
  usePerk: 'Mark as used',
  used: 'Used',
  // How it works (3 steps per game)
  how_scratch: 'Scratch cards',
  how_scratch_1: 'Get a stamp',
  how_scratch_1b: 'Scan the QR at the counter. Each verified stamp earns one card.',
  how_scratch_2: 'Scratch it',
  how_scratch_2b: 'Rub the card with your finger. The prize was decided when you earned it.',
  how_scratch_3: 'Keep the prize',
  how_scratch_3b: 'Points, a shop perk or a streak freeze. The odds are always shown.',
  how_card: 'Stamp cards',
  how_card_1: 'Start with 2',
  how_card_1b: 'Every card comes with 2 welcome stamps already on it.',
  how_card_2: 'One stamp a day',
  how_card_2b: 'Scan the shop’s QR. One stamp per shop per day.',
  how_card_3: 'Claim the reward',
  how_card_3b: 'When the card is full, show it at the counter.',
  how_streak: 'Weekly streak',
  how_streak_1: 'One visit a week',
  how_streak_1b: 'Any verified stamp, any shop, keeps the flame lit.',
  how_streak_2: 'Freezes protect it',
  how_streak_2b: 'You start with 1 and earn 1 every 4 active weeks (2 at most).',
  how_streak_3: 'Going away?',
  how_streak_3b: 'Freeze next week ahead of time. Missed weeks use a freeze on their own.',
  how_sets: 'Collection sets',
  how_sets_1: 'Pick a set',
  how_sets_1b: 'Chai trail, Locally made, Night market and festival trails.',
  how_sets_2: 'Collect the stops',
  how_sets_2b: 'Each different shop that fits the set adds one sticker.',
  how_sets_3: 'Finish it',
  how_sets_3b: 'You get a badge, bonus points and the finishing shop’s set perk.',
  how_coop: 'Neighbourhood goal',
  how_coop_1: 'One shared bar',
  how_coop_1b: 'Every verified visit in your area this week fills it.',
  how_coop_2: 'Help together',
  how_coop_2b: 'Nobody competes: your visits add to everyone’s.',
  how_coop_3: 'Everyone wins',
  how_coop_3b: 'When the goal is reached, everyone who helped collects the bonus.',
  // Front door entry
  gamesCard: 'Your passport games',
  openPassport: 'Open passport',
  // Owner setting (calm owner UI)
  ownerPerksTitle: 'Thank-you perks',
  ownerPerksBody:
    'Small perks customers can earn at your shop. They show on your page. Leave a line empty to skip it.',
  ownerPerkHint: 'For example: free biscuit with any chai',
  ownerSave: 'Save perks',
  ownerSaved: 'Perks saved',
  ownerFailed: 'Perks couldn’t be saved. Try again.',
}

export type GamesStrings = typeof gamesStrings

export function gamesCopy(locale: Locale): GamesStrings {
  return locale === 'en' ? gamesStrings : gamesTranslations[locale]
}

export function useGamesCopy() {
  return gamesCopy(useLocale())
}
