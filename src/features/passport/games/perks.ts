/** The most thank-yous listed at once; the rest wait behind "Show more". */
export const PERKS_SHOWN = 5

/** Words that carry meaning: the short joining words of a condition ("When you ...") do not. */
const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []

/**
 * The condition under a thank-you ("On your third visit") is dropped when the thank-you already
 * says it ("Your third visit: a free refill"): the same words twice read as a mistake.
 */
export function repeatsCondition(text: string, condition: string): boolean {
  const have = new Set(words(text))
  const need = words(condition)
  return text.includes(':') || (need.length > 0 && need.every((word) => have.has(word)))
}
