/** The Photos sheet groups the shop's photos by what they show. English only for now: the
 * other languages follow after release. */
export const GALLERY_KINDS = ['storefront', 'inside', 'menu', 'product', 'other'] as const
export type GalleryKind = (typeof GALLERY_KINDS)[number]

export const galleryGroupCopy = {
  addTo: 'Add to',
  kinds: {
    storefront: 'Shop front',
    inside: 'Inside',
    menu: 'Menu',
    product: 'Products',
    other: 'Other',
  } satisfies Record<GalleryKind, string>,
  cover: 'Cover',
  makeCover: 'Make photo {n} the cover',
  makeCoverLabel: 'Make cover',
  move: 'Move photo {n} to another group',
  moveLabel: 'Move',
  usedNote:
    'The cover is the first photo customers see, on your shop page and in search. The other photos are saved with your shop.',
}

/** Photos saved before kinds existed, or with an unknown kind, sit under "Other". */
export function kindOf(value: string | undefined): GalleryKind {
  return (GALLERY_KINDS as readonly string[]).includes(value ?? '')
    ? (value as GalleryKind)
    : 'other'
}

/** The kind the photo reader found, as a gallery kind. */
export function galleryKindOf(photoKind: string | undefined): GalleryKind {
  if (photoKind === 'storefront' || photoKind === 'signboard') return 'storefront'
  if (photoKind === 'menu' || photoKind === 'price_list') return 'menu'
  return photoKind === 'product' ? 'product' : 'other'
}
