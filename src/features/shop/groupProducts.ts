export type Categorised = { category?: string; available?: boolean }

export function groupProducts<T extends Categorised>(products: T[]) {
  const groups = new Map<string, { category: string; items: T[] }>()
  for (const item of products) {
    const category = item.category?.trim() ?? ''
    const key = category.toLowerCase()
    const group = groups.get(key) ?? { category, items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  return [...groups.values()]
    .sort((a, b) => Number(!a.category) - Number(!b.category))
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) => Number(a.available === false) - Number(b.available === false),
      ),
    }))
}
