/** Keep a collapsed answer readable without hiding the end of a sentence. */
export function sentenceSummary(text: string, maxLength = 220) {
  if (text.length <= maxLength) return text
  const ends = [...text.matchAll(/[.!?।॥](?:[”’"')\]]*)?(?:\s|$)/gu)]
    .map((match) => (match.index ?? 0) + match[0].trimEnd().length)
    .filter((end) => end <= maxLength)
  return ends.length ? text.slice(0, ends[ends.length - 1]) : text
}
