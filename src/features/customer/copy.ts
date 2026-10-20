import type { Locale } from '../../i18n/locales'
import { useLocale } from '../../state/hooks'
import { accountTranslations } from './copyLocales'

/**
 * Customer account, chats, saved, tips and profile strings. English is the source; every
 * supported locale has its own complete set in copyLocales.ts. Counts use `{n}` with a `One`
 * variant for languages that mark the singular.
 */
export const accountStrings = {
  nav: 'Main',
  ask: 'Ask',
  chats: 'Chats',
  saved: 'Saved',
  unread: '{n} unread replies',
  unreadOne: '1 unread reply',
  // Sign-in
  signIn: 'Continue with Google',
  signInLocal: 'Continue with Google (local preview)',
  signInTitle: 'Sign in to message shops',
  signInBody:
    'Owners reply to a real person, so messages need a Google account. Browsing, asking the AI and instant answers stay open to everyone.',
  signInWhy: 'We use your Google name for the owner and keep your chats in one place.',
  signInFollow: 'Sign in to keep followed shops on every device.',
  signInTips: 'Sign in to leave a tip for neighbours.',
  signInUnavailable: 'Sign-in is unavailable right now. Browsing still works.',
  signInUnfinished: 'Sign-in did not finish. Please try again.',
  notNow: 'Not now',
  signedInAs: 'Signed in as {name}',
  signOut: 'Sign out',
  // Profile
  profile: 'Your profile',
  profileButton: 'Profile and preferences',
  preferences: 'What Chalkboard remembers',
  preferencesBody:
    'Said in Ask, like “I’m vegetarian” or “my budget is under ₹100”. Used to rank results For you.',
  vegetarian: 'Vegetarian',
  halal: 'Halal only',
  budget: 'Budget under {amount}',
  language: 'Language: {language}',
  followedCount: 'Following {n} shops',
  followedCountOne: 'Following 1 shop',
  recent: 'Recent searches',
  nothingRemembered: 'Nothing yet. Tell Ask about your diet or budget and it will remember.',
  clear: 'Clear preferences and searches',
  clearing: 'Clearing…',
  cleared: 'Cleared. Follows stay until you unfollow.',
  clearFailed: 'Couldn’t clear your preferences and searches. Nothing was deleted.',
  removeFailed: 'Couldn’t remove “{item}”. It is still saved.',
  retry: 'Try again',
  actionFailed: 'Couldn’t complete that request. Check your connection and try again.',
  // Chats
  chatsTitle: 'Chats',
  chatsSignedOut: 'Your chats with shops live here',
  chatsFailed: 'Your chats couldn’t load. Check your connection.',
  noChats: 'No chats yet',
  noChatsBody: 'Open a shop and tap “Ask the owner”. Replies show up here.',
  findShops: 'Find shops',
  you: 'You',
  aiLabel: 'AI instant answer',
  aiNote: 'From the shop’s listed facts',
  demoReply: 'Demo reply',
  demoReplyNote: 'Automatic: this is a sample shop',
  owner: 'Owner',
  waiting: 'Sent. The owner replies here, usually within the day.',
  typing: '{shop} is typing',
  sending: 'Sending…',
  delivered: 'Delivered',
  failed: 'Not sent. Tap to retry.',
  messagePlaceholder: 'Message',
  send: 'Send',
  back: 'Back',
  viewShop: 'View shop',
  demoShop: 'Demo shop',
  closed: 'This conversation is closed.',
  chatLost: 'This chat is no longer available.',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  today: 'Today',
  yesterday: 'Yesterday',
  // Follow
  follow: 'Follow',
  following: 'Following',
  followShop: 'Follow {shop}',
  unfollowShop: 'Unfollow {shop}',
  followedDevice: 'Saved on this device',
  followFailed: 'Couldn’t update your followed shops. Check your connection and try again.',
  // Saved
  savedTitle: 'Saved',
  followingTitle: 'Following',
  updatesTitle: 'Updates',
  showAllUpdates: 'Show all',
  showLessUpdates: 'Show less',
  noFollows: 'Follow shops to see their news here',
  noFollowsBody: 'Price changes, items back in stock, new dishes and today’s menu checks.',
  noUpdates: 'No updates yet. Changes appear here as the shops make them.',
  feedFailed: 'Updates couldn’t load. The shops you follow are still saved.',
  deviceOnly: 'Saved on this device. Sign in to keep them everywhere.',
  demoUpdate: 'Demo update',
  priceDown: 'Price drop',
  priceUp: 'New price',
  backInStock: 'Back in stock',
  newItem: 'New on the menu',
  menuConfirmed: 'Menu checked today',
  menuConfirmedBody: 'The owner confirmed today’s menu and prices.',
  was: 'was {price}',
  // Personal
  forYou: 'For you',
  remembered: 'Remembered: {items}',
  manage: 'Manage',
  reasonFollowed: 'You follow this shop',
  reasonVegetarian: 'Vegetarian options',
  reasonHalal: 'Halal (owner says)',
  reasonBudget: 'Within your budget',
  // Tips
  tipsTitle: 'Neighbour tips',
  tipsEmpty: 'No tips yet. Be the first to help a neighbour.',
  tipsFailed: 'Tips couldn’t load. Check your connection.',
  tipPlaceholder: 'A short tip for neighbours (best time to go, what to try…)',
  tipLabel: 'Your tip',
  rating: 'Rating',
  stars: '{n} stars',
  starsOne: '1 star',
  postTip: 'Post tip',
  tipPosted: 'Thanks! Your tip is live.',
  tipRejected: 'That tip can’t be shown. Keep it kind, and leave out links and phone numbers.',
  tipUnavailable: 'Tips can’t be checked right now. Please try later.',
  removeTip: 'Remove my tip',
  removeTipFailed: 'Couldn’t remove your tip. Please try again.',
  demoTip: 'Demo tip',
  average: '{rating} average · {count}',
  tipCount: '{n} tips',
  tipCountOne: '1 tip',
  moderated: 'Tips are checked before they appear.',
  agoNow: 'just now',
  agoMinutes: '{n} min ago',
  agoHours: '{n} h ago',
  agoDays: '{n} days ago',
  agoYesterday: 'yesterday',
}

export type AccountStrings = Record<keyof typeof accountStrings, string>

const count = (many: string, one: string) => (n: number) =>
  n === 1 ? one : many.replace('{n}', String(n))

function build(s: AccountStrings) {
  return {
    ...s,
    unread: count(s.unread, s.unreadOne),
    followedCount: count(s.followedCount, s.followedCountOne),
    stars: count(s.stars, s.starsOne),
    tipCount: count(s.tipCount, s.tipCountOne),
    reasons: {
      followed: s.reasonFollowed,
      vegetarian: s.reasonVegetarian,
      halal: s.reasonHalal,
      budget: s.reasonBudget,
    } as Record<string, string>,
    ago: {
      now: s.agoNow,
      minutes: (n: number) => s.agoMinutes.replace('{n}', String(n)),
      hours: (n: number) => s.agoHours.replace('{n}', String(n)),
      days: (n: number) => (n === 1 ? s.agoYesterday : s.agoDays.replace('{n}', String(n))),
    },
  }
}

export type AccountCopy = ReturnType<typeof build>

const cache = new Map<Locale, AccountCopy>()

export function accountCopyFor(locale: Locale): AccountCopy {
  let copy = cache.get(locale)
  if (!copy) {
    copy = build(locale === 'en' ? accountStrings : accountTranslations[locale])
    cache.set(locale, copy)
  }
  return copy
}

/** Customer copy in the language in effect (the phone's, or the one chosen in Settings). */
export function useAccountCopy(): AccountCopy {
  return accountCopyFor(useLocale())
}

export function timeAgo(seconds: number, t: AccountCopy) {
  const delta = Math.max(0, Date.now() / 1000 - seconds)
  if (delta < 60) return t.ago.now
  if (delta < 3600) return t.ago.minutes(Math.floor(delta / 60))
  if (delta < 86_400) return t.ago.hours(Math.floor(delta / 3600))
  return t.ago.days(Math.floor(delta / 86_400))
}

export function clockTime(seconds: number, locale: string) {
  const date = new Date(seconds * 1000)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return new Intl.DateTimeFormat(
    locale,
    sameDay ? { hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short' },
  ).format(date)
}
