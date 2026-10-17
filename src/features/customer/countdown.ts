/** `mm:ss` in the last hour, `1 h 20 min` before that (real end times only). */
export function countdown(ms: number, locale: string) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) {
    const seconds = Math.max(0, Math.floor((ms % 60_000) / 1000))
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }
  const unit = (value: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value)
  return `${unit(Math.floor(minutes / 60), 'hour')} ${unit(minutes % 60, 'minute')}`
}
