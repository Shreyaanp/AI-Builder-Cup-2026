/** A message's date in the shop's own timezone, as YYYY-MM-DD. */
function dayIn(timeZone: string, at: number) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/**
 * "Today, 9:56 AM", "Yesterday, 6:10 PM" or "3 Nov, 9:56 AM", in the shop's timezone and the
 * owner's language (OB-303); never "03/11/26, 12:00 am".
 */
export function messageTime(seconds: number, locale: string, timeZone: string, now = Date.now()) {
  const at = seconds * 1000
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    // Hindi and Marathi say "सुबह 9:56", never the English "9:56 am".
    ...(/^(?:hi|mr)\b/.test(locale) ? { dayPeriod: 'short' as const } : {}),
  }).format(at)
  const today = dayIn(timeZone, now)
  const day = dayIn(timeZone, at)
  const ago = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000)
  let label: string
  if (ago === 0 || ago === 1) {
    const word = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-ago, 'day')
    label = word.charAt(0).toLocaleUpperCase(locale) + word.slice(1)
  } else {
    label = new Intl.DateTimeFormat(locale, {
      timeZone,
      day: 'numeric',
      month: 'short',
      ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
    }).format(at)
  }
  return `${label}, ${time}`
}
