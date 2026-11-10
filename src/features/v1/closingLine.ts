import { stripOfflinePrefix } from './offlinePrefix'

/** A sentence's words alone: case, spacing and end marks (. ! ? । …) never tell two apart. */
const bare = (sentence: string) =>
  sentence
    .replace(/[.!?।…\s]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()

/**
 * The summary card is up and its title already says "Your shop is set up": a coach sentence that
 * only repeats it is left out, so the owner reads it once (main CI, 10 Nov: it showed twice, the
 * coach's closing words right above the card's title). The rest of the line stays as said; a line
 * that was nothing but the title is empty.
 */
export function withoutSummaryTitle(text: string, title: string): string {
  const said = stripOfflinePrefix(text)
  const sentences = said.match(/[^.!?।]+(?:[.!?।]+|$)/gu) ?? []
  const kept = sentences.filter((sentence) => bare(sentence) !== bare(title))
  if (kept.length === sentences.length) return text
  return kept.join('').trim()
}
