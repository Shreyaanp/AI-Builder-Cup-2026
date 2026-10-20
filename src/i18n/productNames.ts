/** Display seeded product names in the selected UI language without changing stored names. */
export function productName(name: string, locale: string): string {
  if (locale.toLowerCase().startsWith('hi') && name === 'Tea dust') return 'चाय पत्ती'
  return name
}
