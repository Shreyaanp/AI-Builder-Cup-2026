/**
 * (English only; not used when the reward opens the sentence, as in Hindi.) A reward the owner typed
 * as a title ("A free chai") reads mid-sentence ("8 more for a free chai"): lower the article.
 * Anything else ("Your tenth kopi is free", "UPI cashback") is the owner's own wording and stays.
 */
export function midSentence(reward: string): string {
  return reward.replace(/^(A|An|The)(?=\s)/, (article) => article.toLowerCase())
}
