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
  nothingToReorder: 'Nothing looks low right now. Type what you need above, like: butter, 2 kg.',
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
  // Sold in a unit the shop's count does not convert to (pack vs kg): nothing drafted (OB-239).
  checkUnits: (supplierQuantity: string, supplierUnit: string, item: string, unit: string) =>
    `Check this first: the supplier sells ${item} by the ${supplierUnit} (at least ${supplierQuantity}) and you count it in ${unit}, so no order was drafted. Check the unit and the supplier’s minimum, or ask the coach for the amount you want.`,
  // No use of its own on record (never sold, or only the chai made from it): nothing drafted
  // (OB-242, OB-243).
  checkUse: (item: string) =>
    `I can’t tell how much ${item} you use, so no order was drafted. How much do you buy a week? Tell the coach.`,
  // Approving a draft far beyond what the shop uses: refused, nothing sent (OB-242).
  tooBig: 'This order is much bigger than you use. Check the amount first.',
  // Made here, or not said yet: only stock the shop buys is ordered (OB-239).
  madeHere: (item: string) =>
    `You make ${item} yourself, so there is no supplier order. Plan how many to make in the prep plan.`,
  // A service shop's tile is called Services, not Menu (OB-243).
  askSource: (item: string, services: boolean) =>
    `Do you make ${item} or buy it? Tell the coach, or choose in Shop › ${services ? 'Services' : 'Menu'}.`,
  orderMore: 'Order more',
  notNow: 'Not now',
  // Grow and Today lead with one need; the rest still to order.
  moreRunOut: (n: number) => (n === 1 ? '1 more item runs out' : `${n} more items run out`),
  reorderPrompt: (item: string) => `reorder ${item}`,
  // Ordered already: Today says it is coming, never a second Reorder (OB-263).
  arrivingLine: (quantity: string, unit: string, day: string) =>
    day ? `${quantity} ${unit} arriving ${day}\u00a0✓` : `${quantity} ${unit} on its way\u00a0✓`,
  // Hindi needs the item's gender (होगी / होगा); English does not.
  // Grow's one-line Buy stock status (OB-263).
  arrivingShort: (item: string, day: string) =>
    day ? `${item} arriving ${day}\u00a0✓` : `${item} on its way\u00a0✓`,
  stillRunsOut: ((day: string) => `Still runs out ${day}`) as (
    day: string,
    feminine: boolean,
  ) => string,
  toppedUp: (item: string, stock: string) => `${item} stock topped up: ${stock}\u00a0✓`,
  // Goods arrived: what came and the stock now, with Undo; never a price (OB-263).
  receivedOne: ((amount: string, item: string, stock: string) =>
    `${amount} ${item} received. Stock is now ${stock}.`) as (
    amount: string,
    item: string,
    stock: string,
    feminine?: boolean,
  ) => string,
  receivedMany: (n: number) => `${n} items received. Stock updated.`,
  receivedUndone: 'Undone. The order is on its way again.',
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
  nothingToReorder: 'अभी कुछ कम नहीं दिख रहा। ऊपर लिखें क्या चाहिए, जैसे: मक्खन, 2 किलो।',
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
  checkUnits: (supplierQuantity, supplierUnit, item, unit) =>
    `पहले जाँच लें: सप्लायर ${item} ${supplierUnit} में बेचता है (कम से कम ${supplierQuantity}) और आप इसे ${unit} में गिनते हैं, इसलिए कोई ऑर्डर नहीं बना। इकाई और सप्लायर की न्यूनतम मात्रा देखें, या कोच से उतना माँगें जितना चाहिए।`,
  checkUse: (item) =>
    `मैं नहीं बता सकता कि आप कितना ${item} इस्तेमाल करते हैं, इसलिए कोई ऑर्डर नहीं बना। आप हफ़्ते में कितना खरीदते हैं? कोच को बताएँ।`,
  tooBig: 'यह ऑर्डर आपके इस्तेमाल से बहुत बड़ा है। पहले मात्रा जाँच लें।',
  madeHere: (item) =>
    `${item} आप खुद बनाते हैं, इसलिए सप्लायर को ऑर्डर नहीं जाता। कितना बनाना है, यह तैयारी योजना में देखें।`,
  askSource: (item, services) =>
    `${item} आप बनाते हैं या खरीदते हैं? कोच को बताएँ, या दुकान › ${services ? 'सेवाएँ' : 'मेन्यू'} में चुनें।`,
  orderMore: 'और मँगाएँ',
  notNow: 'अभी नहीं',
  moreRunOut: (n) => (n === 1 ? '1 और चीज़ खत्म हो रही है' : `${n} और चीज़ें खत्म हो रही हैं`),
  reorderPrompt: (item) => `${item} फिर से मँगाएँ`,
  arrivingLine: (quantity, unit, day) =>
    day
      ? `${quantity} ${unit} ${day} को आ रहा है\u00a0✓`
      : `${quantity} ${unit} रास्ते में है\u00a0✓`,
  arrivingShort: (item, day) =>
    day ? `${item} रास्ते में, ${day}\u00a0✓` : `${item} रास्ते में\u00a0✓`,
  stillRunsOut: (day, feminine) => `फिर भी ${day} को खत्म ${feminine ? 'होगी' : 'होगा'}`,
  toppedUp: (item, stock) => `${item} का स्टॉक भर गया: ${stock}\u00a0✓`,
  receivedOne: (amount, item, stock, feminine) =>
    `${amount} ${item} आ ${feminine ? 'गई' : 'गया'}। अब स्टॉक ${stock} है।`,
  receivedMany: (n) => `${n} चीज़ें आ गईं। स्टॉक अपडेट हो गया।`,
  receivedUndone: 'वापस ले लिया। ऑर्डर फिर से रास्ते में है।',
}

const tables: Record<string, OrderChangeCopy> = { en, hi }

export function useOrderChangeCopy(): OrderChangeCopy {
  return tables[useLocale()] ?? en
}
