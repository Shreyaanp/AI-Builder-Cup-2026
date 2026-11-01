import { useLocale } from '../../state/hooks'

/**
 * Changing or cancelling an order after it went out, and why a reorder drafted nothing
 * (OB-225, OB-226, OB-227). Hindi and English are complete; other languages show English
 * until translated, like the supply screens' copy.
 */
const en = {
  cancelOrder: 'Cancel order',
  changeQuantity: 'Change quantity',
  keepOrder: 'Keep order',
  sendCancel: 'Send cancellation',
  sendChange: 'Send change',
  undo: 'Undo',
  sendingIn: (n: number) => `Sending in ${n} s`,
  cancellingIn: (n: number) => `Cancelling in ${n} s`,
  // Chat orders: the cancellation and the change reach the supplier as messages.
  cancelAsk: (supplier: string, text: string) => `${supplier} gets: “${text}”`,
  changeAsk: (supplier: string) => `${supplier} gets the new quantities and confirms again.`,
  quantityOf: (item: string, unit: string) => `${item} (${unit})`,
  // Purchase orders: a demo supplier is told in the app; a real one the way the owner orders.
  poCancelAsk: (supplier: string, simulated: boolean) =>
    simulated
      ? `Cancel this order? ${supplier} is a demo supplier: the app tells it.`
      : `Cancel this order? Tell ${supplier} the way you usually order.`,
  poCancelled: (supplier: string, simulated: boolean) =>
    simulated
      ? `Cancelled. ${supplier} was told.`
      : `Cancelled here. Remember to tell ${supplier}.`,
  failed: 'That didn’t work. Try again.',
  // Why "Draft a reorder" made nothing, with the way forward.
  nothingToReorder:
    'Nothing runs out soon, so there is nothing to reorder. Add stock counts and sales to get a forecast.',
  noSupplierFor: (item: string) =>
    `No supplier near you sells ${item} yet. Ask the coach to find suppliers for it.`,
  onOrder: (quantity: string, unit: string, item: string, day: string) =>
    day
      ? `${quantity} ${unit} ${item} is already on order, arriving ${day}. No new order needed.`
      : `${quantity} ${unit} ${item} is already on order. No new order needed.`,
  onOrderLine: (quantity: string, unit: string, day: string) =>
    day ? `${quantity} ${unit} on order, arriving ${day}` : `${quantity} ${unit} on order`,
  // On order in a unit that does not compare with the stock (2 pack, litres): ask first (#603).
  unitsAsk: (amounts: string, item: string, day: string) =>
    `${amounts} ${item} is already on order${day ? `, arriving ${day}` : ''}. The app can’t tell if that is enough. Order more anyway?`,
  // More than a month of use in one draft: nothing was drafted (OB-239).
  checkQuantity: (quantity: string, unit: string, item: string, days: number) =>
    `Check this first: ${quantity} ${unit} ${item} is about ${days} days of what you use, so no order was drafted. Check the item and the supplier’s minimum, or ask the coach for the amount you want.`,
  orderMore: 'Order more',
  notNow: 'Not now',
  // Grow and Today lead with one need; the rest still to order.
  moreRunOut: (n: number) => (n === 1 ? '1 more item runs out' : `${n} more items run out`),
  reorderPrompt: (item: string) => `reorder ${item}`,
}

export type OrderChangeCopy = typeof en

const hi: OrderChangeCopy = {
  cancelOrder: 'ऑर्डर रद्द करें',
  changeQuantity: 'मात्रा बदलें',
  keepOrder: 'ऑर्डर रखें',
  sendCancel: 'रद्द करना भेजें',
  sendChange: 'बदलाव भेजें',
  undo: 'वापस लें',
  sendingIn: (n) => `${n} सेकंड में भेज रहे हैं`,
  cancellingIn: (n) => `${n} सेकंड में रद्द हो रहा है`,
  cancelAsk: (supplier, text) => `${supplier} को जाएगा: “${text}”`,
  changeAsk: (supplier) => `${supplier} को नई मात्रा जाएगी, वे फिर से पक्का करेंगे।`,
  quantityOf: (item, unit) => `${item} (${unit})`,
  poCancelAsk: (supplier, simulated) =>
    simulated
      ? `यह ऑर्डर रद्द करें? ${supplier} डेमो सप्लायर है: ऐप उसे बता देगा।`
      : `यह ऑर्डर रद्द करें? ${supplier} को वैसे ही बताएँ जैसे आप ऑर्डर करते हैं।`,
  poCancelled: (supplier, simulated) =>
    simulated
      ? `रद्द हो गया। ${supplier} को बता दिया।`
      : `यहाँ रद्द हो गया। ${supplier} को बताना न भूलें।`,
  failed: 'नहीं हो पाया। फिर कोशिश करें।',
  nothingToReorder:
    'जल्द कुछ खत्म नहीं हो रहा, इसलिए फिर मँगाने को कुछ नहीं। अनुमान के लिए स्टॉक और बिक्री जोड़ें।',
  noSupplierFor: (item) =>
    `आपके पास अभी कोई सप्लायर ${item} नहीं बेचता। कोच से इसके सप्लायर खोजने को कहें।`,
  onOrder: (quantity, unit, item, day) =>
    day
      ? `${quantity} ${unit} ${item} पहले से ऑर्डर पर है, ${day} को आएगा। नया ऑर्डर नहीं चाहिए।`
      : `${quantity} ${unit} ${item} पहले से ऑर्डर पर है। नया ऑर्डर नहीं चाहिए।`,
  onOrderLine: (quantity, unit, day) =>
    day ? `${quantity} ${unit} ऑर्डर पर, ${day} को आएगा` : `${quantity} ${unit} ऑर्डर पर`,
  unitsAsk: (amounts, item, day) =>
    `${amounts} ${item} पहले से ऑर्डर पर है${day ? `, ${day} को आएगा` : ''}। ऐप नहीं बता सकता कि यह काफ़ी है या नहीं। फिर भी और मँगाएँ?`,
  checkQuantity: (quantity, unit, item, days) =>
    `पहले जाँच लें: ${quantity} ${unit} ${item} आपके लगभग ${days} दिन के इस्तेमाल जितना है, इसलिए कोई ऑर्डर नहीं बना। चीज़ और सप्लायर की न्यूनतम मात्रा देखें, या कोच से उतना माँगें जितना चाहिए।`,
  orderMore: 'और मँगाएँ',
  notNow: 'अभी नहीं',
  moreRunOut: (n) => (n === 1 ? '1 और चीज़ खत्म हो रही है' : `${n} और चीज़ें खत्म हो रही हैं`),
  reorderPrompt: (item) => `${item} फिर से मँगाएँ`,
}

const tables: Record<string, OrderChangeCopy> = { en, hi }

export function useOrderChangeCopy(): OrderChangeCopy {
  return tables[useLocale()] ?? en
}
