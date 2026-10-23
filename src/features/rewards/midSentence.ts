/**
 * A reward the owner typed as a title ("A free chai") reads mid-sentence ("8 more for a free
 * chai"): lower the first capital unless the next letter is one too ("UPI cashback").
 */
export function midSentence(reward: string): string {
  return reward.replace(/^([A-Z])(?![A-Z])/, (letter) => letter.toLowerCase())
}
