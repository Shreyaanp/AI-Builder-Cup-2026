export function formatDistance(metres: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: metres < 1000 ? 'meter' : 'kilometer',
    maximumFractionDigits: metres < 1000 ? 0 : 1,
  }).format(metres < 1000 ? Math.round(metres / 10) * 10 : metres / 1000)
}
