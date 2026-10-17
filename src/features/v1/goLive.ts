/** What a shop needs before it can be listed: its name, what it sells and where it is. */
export type ListingField = 'name' | 'category' | 'location'

type Listable = {
  business: { name?: string; category?: string; location?: string; lat?: number | null } | null
}

/** The required answers still missing, in the order the coach asks them. */
export function missingForListing(draft: Listable): ListingField[] {
  const b = draft.business
  const missing: ListingField[] = []
  if (!b?.name?.trim()) missing.push('name')
  if (!b?.category?.trim()) missing.push('category')
  if (b?.lat == null && !b?.location?.trim()) missing.push('location')
  return missing
}
