import type { useShopCopy } from './strings'

/** The fixed selling units (same list as backend/app/product_units.py). */
export const UNITS = [
  'item',
  'piece',
  'cup',
  'glass',
  'bottle',
  'plate',
  'bowl',
  'set',
  'portion',
  'slice',
  'pack',
  'box',
  'dozen',
  'kg',
  'g',
  'litre',
  'ml',
  'hour',
  'service',
] as const
export type Unit = (typeof UNITS)[number]

// Legacy free-text spellings saved before the list existed.
const SYNONYMS: Partial<Record<string, Unit>> = {
  each: 'item',
  ea: 'item',
  unit: 'item',
  units: 'item',
  items: 'item',
  pc: 'piece',
  pcs: 'piece',
  pieces: 'piece',
  cups: 'cup',
  mug: 'cup',
  glasses: 'glass',
  bottles: 'bottle',
  btl: 'bottle',
  can: 'bottle',
  cans: 'bottle',
  plates: 'plate',
  bowls: 'bowl',
  sets: 'set',
  combo: 'set',
  meal: 'set',
  portions: 'portion',
  serving: 'portion',
  servings: 'portion',
  serve: 'portion',
  slices: 'slice',
  packs: 'pack',
  packet: 'pack',
  packets: 'pack',
  pkt: 'pack',
  bag: 'pack',
  bags: 'pack',
  boxes: 'box',
  doz: 'dozen',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  gm: 'g',
  gram: 'g',
  grams: 'g',
  gr: 'g',
  l: 'litre',
  ltr: 'litre',
  liter: 'litre',
  liters: 'litre',
  litres: 'litre',
  millilitre: 'ml',
  milliliter: 'ml',
  hr: 'hour',
  hrs: 'hour',
  hours: 'hour',
  session: 'service',
  services: 'service',
  job: 'service',
}

/** The fixed unit a saved unit means, or null for free text the owner hasn't replaced yet. */
export function unitKey(raw: string): Unit | null {
  const key = raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .replace(/^(per|a|an|1) /, '')
    .replace(/^[. ]+|[. ]+$/g, '')
  if ((UNITS as readonly string[]).includes(key)) return key as Unit
  // Own keys only: "constructor" must not resolve to Object's.
  return Object.hasOwn(SYNONYMS, key) ? (SYNONYMS[key] ?? null) : null
}

/** A saved unit in the owner's language; unknown legacy text shows exactly as saved. */
export function unitLabel(raw: string, copy: ReturnType<typeof useShopCopy>): string {
  const key = unitKey(raw)
  return key ? copy.units[key] : raw
}
