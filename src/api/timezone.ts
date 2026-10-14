/** A new shop opens in the owner's own timezone, wherever they are. */
export function clientTimezoneHeader(): Record<string, string> {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone ? { 'X-Client-Timezone': zone } : {}
  } catch {
    return {}
  }
}
