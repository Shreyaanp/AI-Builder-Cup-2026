/** Customer account, chats, saved and tips copy. English for now; other locales fall back. */
export const accountCopy = {
  nav: 'Main',
  ask: 'Ask',
  chats: 'Chats',
  saved: 'Saved',
  unread: (n: number) => (n === 1 ? '1 unread reply' : `${n} unread replies`),
  // Sign-in
  signIn: 'Continue with Google',
  signInLocal: 'Continue with Google (local preview)',
  signInTitle: 'Sign in to message shops',
  signInBody:
    'Owners reply to a real person, so messages need a Google account. Browsing, asking the AI and instant answers stay open to everyone.',
  signInWhy: 'We use your Google name for the owner and keep your chats in one place.',
  signInFollow: 'Sign in to keep followed shops on every device.',
  signInTips: 'Sign in to leave a tip for neighbours.',
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
  followedCount: (n: number) => (n === 1 ? 'Following 1 shop' : `Following ${n} shops`),
  recent: 'Recent searches',
  nothingRemembered: 'Nothing yet. Tell Ask about your diet or budget and it will remember.',
  clear: 'Clear preferences and searches',
  cleared: 'Cleared. Follows stay until you unfollow.',
  // Chats
  chatsTitle: 'Chats',
  chatsSignedOut: 'Your chats with shops live here',
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
  // Saved
  savedTitle: 'Saved',
  followingTitle: 'Following',
  updatesTitle: 'Updates',
  noFollows: 'Follow shops to see their news here',
  noFollowsBody: 'Price changes, items back in stock, new dishes and today’s menu checks.',
  noUpdates: 'No updates yet. Changes appear here as the shops make them.',
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
  reasons: {
    followed: 'You follow this shop',
    vegetarian: 'Vegetarian options',
    halal: 'Halal (owner says)',
    budget: 'Within your budget',
  } as Record<string, string>,
  // Tips
  tipsTitle: 'Neighbour tips',
  tipsEmpty: 'No tips yet. Be the first to help a neighbour.',
  tipPlaceholder: 'A short tip for neighbours (best time to go, what to try…)',
  tipLabel: 'Your tip',
  rating: 'Rating',
  stars: (n: number) => (n === 1 ? '1 star' : `${n} stars`),
  postTip: 'Post tip',
  tipPosted: 'Thanks! Your tip is live.',
  tipRejected: 'That tip can’t be shown. Keep it kind, and leave out links and phone numbers.',
  tipUnavailable: 'Tips can’t be checked right now. Please try later.',
  removeTip: 'Remove my tip',
  demoTip: 'Demo tip',
  average: '{rating} average · {count}',
  tipCount: (n: number) => (n === 1 ? '1 tip' : `${n} tips`),
  moderated: 'Tips are checked before they appear.',
  ago: {
    now: 'just now',
    minutes: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n} h ago`,
    days: (n: number) => (n === 1 ? 'yesterday' : `${n} days ago`),
  },
}

export type AccountCopy = typeof accountCopy

export function timeAgo(seconds: number, t: AccountCopy = accountCopy) {
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
