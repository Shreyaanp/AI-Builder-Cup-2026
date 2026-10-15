import type { components } from '../../api/generated'

type Schemas = components['schemas']

// The server always sends defaulted fields; the generated contract marks them optional.
export type Preferences = Required<Schemas['Preferences']>
export type Profile = Omit<Required<Schemas['Profile']>, 'preferences' | 'searches'> & {
  preferences: Preferences
  searches: Required<Schemas['Search']>[]
}
export type Message = Required<Schemas['ThreadMessage']>
export type Thread = Omit<Required<Schemas['CustomerThread']>, 'messages'> & {
  messages: Message[]
}
export type ShopCard = Schemas['ShopCard']
export type ChatSummary = Omit<Schemas['ChatSummary'], 'thread' | 'shop' | 'unread'> & {
  shop: ShopCard
  thread: Thread
  unread: number
}
export type Update = Schemas['Update']
export type Feed = { shops: ShopCard[]; updates: Update[] }
export type Tip = Schemas['Tip']
export type TipList = { tips: Tip[]; average?: number | null }
export type Me = Omit<Schemas['Me'], 'profile'> & { profile?: Profile | null }
