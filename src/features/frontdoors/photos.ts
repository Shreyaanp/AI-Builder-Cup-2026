/** Publication needs an explicit approved-photo API. Extraction uploads never become public. */
export function ownerApprovedPhoto(id: string): string | undefined {
  void id
  return undefined
}

export function categoryArt(category: string): string {
  const text = category.toLowerCase()
  const key = /bak|bread/.test(text)
    ? 'bakery'
    : /hawker|food|restaurant/.test(text)
      ? 'hawker'
      : /groc|supermarket/.test(text)
        ? 'grocery'
        : /cater/.test(text)
          ? 'catering'
          : 'kopi'
  return `/art/category-${key}.svg`
}
