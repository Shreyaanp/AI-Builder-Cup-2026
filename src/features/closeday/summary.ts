import { isMeasure, unitKey } from '../shop/units'

export type SoldLine = { item: string; quantity: number; amount: number }

/** Money first, as cakes by the kg and rice by the bag never compare by count (OB-330). */
export function bestByMoney(lines: SoldLine[]): { item: string; amount: number } | null {
  const totals = new Map<string, { amount: number; quantity: number }>()
  for (const { item, quantity, amount } of lines) {
    const total = totals.get(item) ?? { amount: 0, quantity: 0 }
    totals.set(item, { amount: total.amount + amount, quantity: total.quantity + quantity })
  }
  const [best] = [...totals].sort(([, x], [, y]) => y.amount - x.amount || y.quantity - x.quantity)
  return best ? { item: best[0], amount: best[1].amount } : null
}

/** The last word every name shares ("cake"), to say "3.5 kg cake"; empty when there is none. */
function sharedWord(names: string[]): string {
  const last = names.map((name) => name.trim().split(/\s+/).at(-1) ?? '')
  const word = last[0] ?? ''
  const same = last.every((each) => each.toLocaleLowerCase() === word.toLocaleLowerCase())
  return same && [...word].length >= 2 ? word : ''
}

/** "12 brownies": English names only, and only endings a plain "s" cannot get wrong. */
function counted(name: string, quantity: number, locale: string): string {
  if (locale !== 'en') return name
  const lower = name.toLocaleLowerCase()
  return quantity !== 1 && /[^aiousy]$/.test(lower) ? `${lower}s` : lower
}

/**
 * What the day sold, when kilos and litres are in it: "3.5 kg cake", "12 brownies". Null when
 * everything is counted in pieces, cups or plates, which do add up to items.
 */
export function soldParts(
  lines: SoldLine[],
  words: {
    locale: string
    unitOf: (item: string) => string
    unitLabel: (raw: string) => string
    name: (item: string) => string
    number: (n: number) => string
    items: (n: number) => string
  },
): string[] | null {
  const { locale } = words
  const measured = new Map<string, Map<string, number>>()
  const count = new Map<string, number>()
  for (const { item, quantity } of lines) {
    const raw = words.unitOf(item)
    if (isMeasure(raw)) {
      const unit = unitKey(raw) ?? raw
      const group = measured.get(unit) ?? new Map<string, number>()
      group.set(item, (group.get(item) ?? 0) + quantity)
      measured.set(unit, group)
    } else count.set(item, (count.get(item) ?? 0) + quantity)
  }
  if (!measured.size) return null
  const sum = (values: Iterable<number>) => [...values].reduce((total, n) => total + n, 0)
  const parts = [...measured].map(([unit, group]) => {
    const names = [...group.keys()].map(words.name)
    const what = names.length === 1 ? names[0]! : sharedWord(names)
    const shown = locale === 'en' ? what.toLocaleLowerCase() : what
    return `${words.number(sum(group.values()))} ${words.unitLabel(unit)} ${shown}`.trim()
  })
  if (count.size === 1) {
    const [item, quantity] = [...count][0]!
    parts.push(`${words.number(quantity)} ${counted(words.name(item), quantity, locale)}`)
  } else if (count.size) parts.push(words.items(sum(count.values())))
  return parts
}
