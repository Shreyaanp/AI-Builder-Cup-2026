import { stripMarkdown } from '../../design/markdownUtils.js'

/** The backend keeps at most this many characters of Google's answer. */
const BACKEND_CAP = 600
const SENTENCE_END = /[.!?…。！？।॥](?:[”’"')\]*_]*)(?=\s|$)/gu
const FINISHED = /[.!?…。！？।॥][”’"')\]*_]*$/u

function outsideCode(text: string) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
}

/** True when the text stops in the middle of a markdown mark (an unclosed ** or ` or [). */
function endsInsideMarkup(text: string) {
  const plain = outsideCode(text)
  const bold = (plain.match(/(?<!\\)\*\*/g) ?? []).length
  const code = (text.match(/(?<!\\)`/g) ?? []).length
  const opens = (plain.match(/\[/g) ?? []).length
  const closes = (plain.match(/\]/g) ?? []).length
  return bold % 2 === 1 || code % 2 === 1 || opens > closes
}

/** Removes the half-open mark at the end, and whatever it was still opening. */
function dropOpenMarkup(text: string) {
  let result = text
  for (let guard = 0; guard < 4 && endsInsideMarkup(result); guard++) {
    const cuts = [
      endsInsideMarkup(result) && (outsideCode(result).match(/\*\*/g) ?? []).length % 2 === 1
        ? result.lastIndexOf('**')
        : -1,
      (result.match(/`/g) ?? []).length % 2 === 1 ? result.lastIndexOf('`') : -1,
      (outsideCode(result).match(/\[/g) ?? []).length >
      (outsideCode(result).match(/\]/g) ?? []).length
        ? result.lastIndexOf('[')
        : -1,
    ].filter((index) => index >= 0)
    if (!cuts.length) break
    result = result.slice(0, Math.max(...cuts))
  }
  return result
}

function plainLines(text: string) {
  return text
    .split('\n')
    .map((line) => {
      const bullet = /^\s*(?:[-*+]|\d+\.)\s+/.test(line)
      const clean = stripMarkdown(line)
      return clean && bullet ? `• ${clean}` : clean
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Google's answer about the area, as clean plain text. The model writes markdown (bold names,
 * bullets) and sometimes stops mid-sentence or mid-mark ("…brew, **Nothing Before"). Marks are
 * removed, and an answer that was cut ends at its last whole sentence (or last whole word with
 * an ellipsis), never inside a word or a mark.
 */
export function cleanAreaText(raw: string): string {
  const text = raw.replace(/\r/g, '').trim()
  if (!text) return ''
  const insideMarkup = endsInsideMarkup(text)
  const dangling = /[,;:(–—-]\s*$/.test(text)
  const atCap = text.length >= BACKEND_CAP - 20 && !FINISHED.test(text)
  if (!insideMarkup && !dangling && !atCap) return plainLines(text)

  const body = insideMarkup ? dropOpenMarkup(text) : text
  const ends = [...body.matchAll(SENTENCE_END)].map(
    (match) => (match.index ?? 0) + match[0].trimEnd().length,
  )
  const lastEnd = ends[ends.length - 1]
  if (lastEnd !== undefined && lastEnd >= 20) return plainLines(body.slice(0, lastEnd))
  let words = body.trimEnd()
  // Stopped at the character cap with no mark open: the last word may be half a word.
  if (!insideMarkup && !dangling) words = words.replace(/\s+\S*$/u, '')
  words = words.replace(/[\s,;:(–—-]+$/u, '')
  const clean = plainLines(words)
  return clean ? `${clean}…` : ''
}

/** Model text that must show as one plain line or paragraph (a chip, a reason). */
export function plainModelText(raw: string): string {
  return stripMarkdown(raw)
}
