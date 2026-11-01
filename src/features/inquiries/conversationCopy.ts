import type { components } from '../../api/generated'
export const conversationEnglish = {
  conversation: 'Conversation',
  openChat: 'Open conversation',
  back: 'Back',
  reply: 'Reply',
  send: 'Send message',
  closeChat: 'Close conversation',
  block: 'Block customer',
  blocked: 'Customer blocked',
  closed: 'Conversation closed',
  unread: 'Unread',
  you: 'You',
  customer: 'Customer',
  shop: 'Shop',
  aiAnswer: 'AI instant answer',
  translate: 'See translation',
  original: 'See original',
  ai: 'AI translation · may be inaccurate',
  fixture: 'Sample translation for the demo',
  remove: 'Delete this conversation',
  confirmDelete: 'Delete this conversation permanently?',
  confirmBlock: 'Block this customer from sending more messages?',
  cancel: 'Cancel',
  chatFailed: 'Could not update the conversation. Please try again.',
  invalid: 'Enter a message of up to 500 characters.',
  chatLoading: 'Loading conversation…',
  polling: 'Live connection unavailable · checking every 15 seconds',
  storage: 'This browser could not save access. Keep this page open to continue chatting.',
  lost: 'This conversation is no longer available.',
}
export type ConversationCopy = typeof conversationEnglish
export type Thread = components['schemas']['CustomerThread']
export type Translation = components['schemas']['Translation']
