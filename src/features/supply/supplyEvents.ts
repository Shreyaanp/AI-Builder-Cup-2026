/**
 * "An order changed": drafted, approved, changed, cancelled or received, a purchase order or a
 * chat order. Every supply view listening (Today, the Grow tile, the Purchase orders sheet)
 * loads again, so none shows "on order" after a cancel on the same screen (#603). Kept apart
 * from supplyData so chat-order screens can signal without loading the supply screens.
 */
export const supplyBus = new EventTarget()

export function supplyChanged() {
  supplyBus.dispatchEvent(new Event('changed'))
}
