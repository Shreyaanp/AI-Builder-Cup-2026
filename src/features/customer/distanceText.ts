export function distanceText(m: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: m < 1000 ? 'meter' : 'kilometer',
    maximumFractionDigits: 1,
  }).format(m < 1000 ? Math.round(m / 10) * 10 : m / 1000)
}
