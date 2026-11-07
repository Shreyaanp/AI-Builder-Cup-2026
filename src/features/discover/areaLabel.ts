/**
 * The name an area is shown by: a neighbourhood ("Ashok Nagar"), never a house number, a street
 * or a full address with its PIN. The server sends a neighbourhood already; this guards labels
 * saved earlier and typed places ("Indiranagar, Bengaluru, Karnataka, India" is "Indiranagar").
 */
export function areaLabel(label: string | undefined, fallback: string): string {
  const first = (label ?? '').split(',')[0]?.trim() ?? ''
  // A house number ("67/1", "12") is not an area; "1st Block Koramangala", "Sector 18" or
  // "DLF Phase 3" are. The server's English "Nearby" is shown in the screen's own language.
  const houseNumber = /^\d+(\/|$|\s*,)|^\d+[-/]\d/.test(first)
  if (!first || houseNumber || ['you', 'nearby'].includes(first.toLowerCase())) return fallback
  return first
}
