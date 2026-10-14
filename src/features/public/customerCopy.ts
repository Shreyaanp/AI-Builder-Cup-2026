import { conversationEnglish } from '../inquiries/conversationCopy'
/** Added to PublicShop's English source and its per-locale fallback registry. */
export const customerEnglish = {
  ...conversationEnglish,
  chatTitle: 'Chat with the shop',
  instantAnswer: 'Instant answer',
  askOwner: 'Ask the owner',
  cancel: 'Cancel',
  chatIntro:
    'Get an instant answer from the shop’s listed details, or send a message the owner replies to.',
  askTitle: 'Ask about this shop',
  question: 'Your question',
  questionHint: 'Ask in any language…',
  sendQuestion: 'Ask the shop assistant',
  priceSuggestion: 'Price',
  hoursSuggestion: 'Hours',
  locationSuggestion: 'Location',
  priceQuestion: 'How much is {item}?',
  hoursQuestion: 'What are the opening hours?',
  locationQuestion: 'Where is this shop?',
  answerNote: "Answer based on the shop's listed details",
  offlineAnswer: 'Simulated answer · offline fixture, no live AI connected',
  questionInvalid: 'Enter a question of up to 500 characters.',
  requestFailed: 'Could not send. Check your connection and try again, or contact the shop.',
  rateLimited: 'Too many requests. Please wait a minute and try again.',
  shopUnavailable: 'This shop page is no longer available.',
  factsChanged: 'The shop details changed. Please ask again.',
  contactTitle: 'Message the shop',
  contactHint: 'Your contact details and message are shared privately with this shop owner.',
  customerName: 'Name (optional)',
  customerContact: 'Phone or email',
  customerContactHint: 'Include the country code for a phone number.',
  customerMessage: 'Message',
  contactInvalid: 'Enter a phone number with country code or an email address.',
  messageInvalid: 'Enter a message of up to 500 characters.',
  nameInvalid: 'Use up to 100 characters for your name.',
  sendMessage: 'Send message',
  sentPending: "Sent to the shop — they haven't replied yet",
  whatsapp: 'WhatsApp',
  whatsappItem: 'Ask about {item} on WhatsApp',
  whatsappMessage: 'Hello {shop}, I would like to ask about your menu.',
  whatsappItemMessage: 'Hello {shop}, I would like to ask about {item}.',
  // Owner-confirmed shop facts, shown as small chips.
  factsLabel: 'Good to know',
  factHalal: 'Halal',
  factMuslimOwned: 'Muslim-owned',
  factNotHalal: 'Not halal',
  factVegetarian: 'Vegetarian options',
  factDelivery: 'Delivery',
  factDeliveryVia: 'Delivery via {name}',
  factNoDelivery: 'No delivery',
  factPreorders: 'Pre-orders',
  factPreordersLead: 'Pre-orders · {lead}',
  factCash: 'Cash',
  factCard: 'Card',
  factOtherPayment: 'Other payment',
  factBusy: 'Busy {hours}',
}

export type CustomerCopy = typeof customerEnglish

export function whatsappUrl(phone: string, shop: string, message: string, item = '') {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(
    message.replace('{shop}', shop).replace('{item}', item),
  )}`
}
