/** Publication needs an explicit approved-photo API. Extraction uploads never become public. */
export function ownerApprovedPhoto(id: string): string | undefined {
  void id
  return undefined
}

/** One illustration per kind of shop; anything unrecognised gets a neutral shopfront, never a cup. */
const ART: [RegExp, string][] = [
  [/flor|flower|bloom|garland/, 'florist'],
  [/tailor|stitch|sew|alter/, 'tailor'],
  [/hardware|tool|repair|fix/, 'hardware'],
  [/salon|barber|beauty|hair|\bspa\b/, 'salon'],
  [/bak|bread|patis/, 'bakery'],
  [/hawker|street food|food|restaurant|kitchen|tiffin|dhaba/, 'hawker'],
  [/cater/, 'catering'],
  [/groc|supermarket|kirana|mart/, 'grocery'],
  [/caf|coffee|kopi|\btea\b|chai/, 'kopi'],
]

export function categoryArt(category: string): string {
  const text = category.toLowerCase()
  const key = ART.find(([pattern]) => pattern.test(text))?.[1] ?? 'shop'
  return `/art/category-${key}.svg`
}
