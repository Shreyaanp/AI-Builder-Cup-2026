export const categories = [
  'coffee',
  'food',
  'bakery',
  'grocery',
  'pharmacy',
  'hardware',
  'fashion',
  'beauty',
  'services',
  'other',
] as const
export type Category = (typeof categories)[number]
const aliases: Record<string, Category> = {
  kopi: 'coffee',
  hawker: 'food',
  cafe: 'coffee',
  café: 'coffee',
  catering: 'food',
}

export function categoryValue(value: unknown): Category | '' {
  const key = typeof value === 'string' ? value.toLowerCase() : ''
  return Object.hasOwn(aliases, key)
    ? (aliases[key] ?? '')
    : categories.includes(key as Category)
      ? (key as Category)
      : ''
}

const keywords: Record<Category, string[]> = {
  coffee: ['kopi', 'coffee', 'tea', 'teh', 'cafe', 'café'],
  food: ['restaurant', 'food', 'hawker', 'cater', 'eatery', 'dhaba', 'tiffin'],
  bakery: ['bakery', 'bake', 'bread'],
  grocery: ['grocer', 'supermarket', 'minimart', 'convenience'],
  pharmacy: ['pharmacy', 'chemist', 'drugstore'],
  hardware: ['hardware', 'tools', 'building supplies'],
  fashion: ['clothing', 'fashion', 'apparel', 'boutique', 'shoe'],
  beauty: ['beauty', 'salon', 'hair', 'barber', 'nail', 'spa'],
  services: ['service', 'laundry', 'repair', 'plumb', 'electric', 'tailor'],
  other: ['store', 'shop', 'retail', 'florist'],
}

/** Matches Places primary types and the owner's own shop category. */
export function matchesInterest(shopCategory: string, interest: string): boolean {
  const category = categoryValue(interest)
  const text = shopCategory.toLowerCase()
  return Boolean(
    category &&
    (categoryValue(text) === category || keywords[category].some((term) => text.includes(term))),
  )
}
