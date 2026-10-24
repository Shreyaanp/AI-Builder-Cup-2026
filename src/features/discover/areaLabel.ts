/**
 * The name an area is shown by: a neighbourhood ("Ashok Nagar"), never a house number, a street
 * or a full address with its PIN. The server sends a neighbourhood already; this guards labels
 * saved earlier and typed places ("Indiranagar, Bengaluru, Karnataka, India" is "Indiranagar").
 */
export function areaLabel(label: string | undefined, fallback: string): string {
  const first = (label ?? '').split(',')[0]?.trim() ?? ''
  // A leading number is a house number ("67/1"); "Sector 18" or "DLF Phase 3" is an area name.
  if (!first || /^\d/.test(first) || first.toLowerCase() === 'you') return fallback
  return first
}
