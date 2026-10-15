import { Coffee, Croissant, Flag, Flame, Flower2, Hammer, Leaf, Moon, Scissors } from 'lucide-react'
import { ShoppingBasket, Store, Sun, Utensils, Wind } from 'lucide-react'

/** A stable small number from a string, for tilts and colours that never jump between renders. */
export function seed(text: string) {
  let hash = 7
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

/** Category art for stickers: one icon per kind of shop. */
export const CATEGORY_ICONS = {
  cafe: Coffee,
  bakery: Croissant,
  florist: Flower2,
  tailor: Scissors,
  hardware: Hammer,
  grocer: ShoppingBasket,
  food: Utensils,
  shop: Store,
} as const

const PATTERNS: [RegExp, keyof typeof CATEGORY_ICONS][] = [
  [/caf|coffee|kopi|tea|kissaten/i, 'cafe'],
  [/bake|bread|patis/i, 'bakery'],
  [/flor|flower/i, 'florist'],
  [/tailor|stitch|sew/i, 'tailor'],
  [/hardware|repair|fix/i, 'hardware'],
  [/grocer|market/i, 'grocer'],
  [/food|kitchen|noodle|restaurant|hawker|street/i, 'food'],
]

export function categoryArt(category: string): keyof typeof CATEGORY_ICONS {
  return PATTERNS.find(([pattern]) => pattern.test(category))?.[1] ?? 'shop'
}

/** Limited-edition stamp art for festival trails. */
export const FESTIVAL_ART = {
  diya: Flame,
  yellow_flag: Flag,
  krathong: Flower2,
  maple_leaf: Leaf,
  kagami_mochi: Sun,
  mandarin: Sun,
  kite: Wind,
  bedug: Moon,
} as const
