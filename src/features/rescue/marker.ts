/**
 * "Hold one for me" leaves a fixed marker in the shop chat (`[rescue <id>] Hold 2 Kaya bun`), so a
 * retried hold never posts twice. Both sides show it as a readable line in their own language.
 */
export function rescueMarker(text: string): { qty: number; item: string } | null {
  const match = /^\[rescue [^\]]+\] Hold (\d+) (.+)$/.exec(text)
  return match ? { qty: Number(match[1]), item: match[2]! } : null
}
