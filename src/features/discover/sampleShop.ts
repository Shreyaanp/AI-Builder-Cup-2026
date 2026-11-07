/**
 * Sample shops are kept in the real customer app on purpose (owner decision), so they must read
 * as samples everywhere, the same way: one plain "Sample shop" chip. The seeded names also end in
 * "(Demo)" or "(Tour)"; the chip says it, so the name does not repeat it.
 */
export function plainShopName(name: string): string {
  const plain = name.replace(/(\s*\((?:Demo|Tour)\))+\s*$/i, '').trim()
  return plain || name
}
