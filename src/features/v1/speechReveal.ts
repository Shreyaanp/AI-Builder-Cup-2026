/**
 * Voice and text in step: the coach's words appear as they are spoken, and the cards a reply
 * refers to (chart, shop card, menu proposal, map pin) appear when the voice reaches them.
 *
 * The live session sends the reply twice: audio (queued to play) and a transcript of it, in
 * pieces. Each transcript piece is pinned to the audio clock: its words are spoken between the
 * end of the previous piece and the end of the audio queued so far. Without audio (muted, the
 * phone's own voice, a text fallback) the words come at a natural speaking rate.
 *
 * Pure and clock-agnostic (times are milliseconds on one monotonic clock) so it is unit-testable;
 * `useSpokenReveal` drives it from the real audio queue.
 */

/** A natural speaking rate, for when there is no audio clock to follow. */
export const SPEECH_CHARS_PER_SECOND = 15
// A transcript piece is never revealed faster or slower than speech can plausibly be, whatever
// the queue says (a transcript that lags the audio catches up; a long queue does not stall it).
const FASTEST = 32
const SLOWEST = 8

/** Live transcripts arrive in pieces, sometimes repeated in full. */
export function mergeTranscript(current: string, next: string) {
  if (!current.trim()) return next
  if (next.trim().startsWith(current.trim())) return next
  if (current.trim().endsWith(next.trim())) return current
  return current + next
}

const SPACE = /\s/
const SENTENCE_END = /[.!?。！？।॥…\n]/

/** Never cut a word in half; scripts without spaces (CJK, Thai) reveal by character. */
export function snapToWord(text: string, position: number) {
  if (position >= text.length) return text.length
  if (position <= 0) return 0
  for (let i = position; i > Math.max(0, position - 16); i--) if (SPACE.test(text[i]!)) return i
  return position
}

/** Reduced motion: whole sentences only (no word-by-word movement). */
export function snapToSentence(text: string, position: number) {
  if (position >= text.length) return text.length
  for (let i = position - 1; i >= 0; i--) if (SENTENCE_END.test(text[i]!)) return i + 1
  return 0
}

/** Characters per second to say `chars` by `until` (ms from now), within speech's bounds. */
function paceTo(chars: number, until: number) {
  return Math.min(FASTEST, Math.max(SLOWEST, chars / (Math.max(1, until) / 1000)))
}

interface Mark {
  /** Characters spoken by `at`. */
  chars: number
  at: number
}

interface Cue {
  run: () => void
  /** Text length when the card arrived: the voice starts talking about it from here. */
  anchor: number
  /** Words that name the card (a chart title, a shop name): the voice saying one shows it. */
  words: (string | RegExp)[]
  /** Where the voice names it, once found in the transcript. */
  named?: number
  /** The end of the sentence that names it: the card shows as that sentence is said. */
  mention?: number
}

export class SpeechTimeline {
  text = ''
  /** Where the words still on screen start (earlier ones were split off above a card). */
  base = 0
  private marks: Mark[] = []
  private cues: Cue[] = []
  private finished = false
  /** This turn has played audio (its words follow the voice, not a speaking rate). */
  private voiced = false
  /** The newest words were paced at a speaking rate, waiting for their audio. */
  private paced = false
  /** While a card is being shown: where in the words it belongs. */
  private releasing: number | undefined

  /**
   * The transcript so far (whole, not a piece). `remaining`: milliseconds of audio queued to
   * play from `now`, or null when there is no audio clock.
   */
  update(text: string, now: number, remaining: number | null) {
    const before = this.text.length
    this.text = text
    if (text.length <= before) {
      // A corrected transcript can be shorter: nothing already spoken comes back.
      this.marks = this.marks.map((mark) => ({ ...mark, chars: Math.min(mark.chars, text.length) }))
      return
    }
    const added = text.length - before
    const last = this.marks.at(-1)
    const start = Math.max(last?.at ?? now, now)
    const timed = remaining !== null && remaining > 50
    this.voiced ||= timed
    this.paced = !timed
    const rate = timed ? paceTo(added, now + remaining - start) : SPEECH_CHARS_PER_SECOND
    if (!last || last.at < now) this.marks.push({ chars: before, at: start })
    this.marks.push({ chars: text.length, at: start + (added / rate) * 1000 })
  }

  /**
   * Every frame: words that arrived before their audio were paced at a speaking rate; once the
   * audio is queued, what is left of them follows it instead.
   */
  sync(now: number, remaining: number | null) {
    if (!this.paced || remaining === null || remaining <= 50 || this.endsAt() <= now) return
    const from = this.spoken(now)
    const added = this.text.length - from
    this.marks = [
      { chars: from, at: now },
      { chars: this.text.length, at: now + (added / paceTo(added, now + remaining - now)) * 1000 },
    ]
    this.paced = false
    this.voiced = true
  }

  /** How many characters have been spoken by `now`. */
  spoken(now: number) {
    let chars = 0
    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i]!
      if (now >= mark.at) {
        chars = mark.chars
        continue
      }
      const previous = this.marks[i - 1]
      if (previous && mark.at > previous.at)
        chars =
          previous.chars +
          ((mark.chars - previous.chars) * (now - previous.at)) / (mark.at - previous.at)
      break
    }
    return Math.min(this.text.length, Math.floor(chars))
  }

  /** The characters to show at `now` (whole words; whole sentences with reduced motion). */
  visible(now: number, reduced = false) {
    const spoken = this.spoken(now)
    return reduced ? snapToSentence(this.text, spoken) : snapToWord(this.text, spoken)
  }

  /** The time by which everything received so far has been spoken. */
  endsAt() {
    return this.marks.at(-1)?.at ?? 0
  }

  /**
   * A card the reply refers to, shown when the voice reaches it: when one of `words` is said,
   * or else once the voice moves past where the card arrived. `from`: search the turn from there
   * (a card offered because of what the coach is saying searches from the start).
   */
  cue(run: () => void, words: (string | RegExp)[] = [], from = this.text.length) {
    this.cues.push({
      run,
      anchor: Math.min(from, this.text.length),
      words: words
        .map((word) =>
          typeof word === 'string'
            ? word.trim().toLocaleLowerCase()
            : new RegExp(word.source, word.flags.replace('g', '')),
        )
        .filter((word) => typeof word !== 'string' || word.length > 2),
    })
  }

  /** The turn's text is all in: what remains plays out, then the turn is done. */
  finish(now: number) {
    this.finished = true
    // A turn with no audio at all (muted, a text reply) has no voice to keep pace with.
    if (!this.voiced) this.marks = [{ chars: this.text.length, at: now }]
  }

  get isFinished() {
    return this.finished
  }

  /** Spoken to the end of a finished turn. */
  done(now: number) {
    return this.finished && this.spoken(now) >= this.text.length
  }

  /** Run the cues the voice has reached by `now`; returns how many ran. */
  release(now: number, reduced = false) {
    const shown = this.visible(now, reduced)
    const lower = this.text.toLocaleLowerCase()
    const end = this.done(now)
    let ran = 0
    this.cues = this.cues.filter((cue) => {
      if (cue.named === undefined)
        for (const word of cue.words) {
          if (typeof word === 'string') {
            const at = lower.indexOf(word, cue.anchor)
            if (at >= 0) cue.named = at + word.length
          } else {
            const found = word.exec(this.text.slice(cue.anchor))
            if (found) cue.named = cue.anchor + found.index + found[0].length
          }
          if (cue.named !== undefined) break
        }
      if (cue.named !== undefined && cue.mention === undefined) {
        // Whole sentences stay together: "snap a photo of your board." then the camera.
        const rest = this.text.slice(cue.named).search(SENTENCE_END)
        if (rest >= 0) cue.mention = cue.named + rest + 1
        else if (this.finished) cue.mention = this.text.length
      }
      // Named: when the name is said. Otherwise: once the voice has moved past where the card
      // arrived (it is talking about it), or at the end of the turn.
      const reached =
        end ||
        (cue.named !== undefined
          ? cue.mention !== undefined && shown >= cue.mention
          : shown > cue.anchor)
      if (reached) {
        this.releasing = cue.mention ?? cue.anchor
        cue.run()
        this.releasing = undefined
        ran++
      }
      return !reached
    })
    return ran
  }

  /**
   * Barge-in or stop: the voice and the words stop together. Returns what was said; cards the
   * reply had prepared still appear (they are facts, not speech).
   */
  cut(now: number, reduced = false) {
    const said = this.text.slice(this.base, Math.max(this.base, this.visible(now, reduced))).trim()
    this.base = this.text.length
    this.cues.forEach((cue) => cue.run())
    this.reset()
    return said
  }

  /** Show everything now (the session ended normally under a reveal still catching up). */
  flush() {
    const text = this.text.slice(this.base).trim()
    this.base = this.text.length
    this.cues.forEach((cue) => cue.run())
    this.reset()
    return text
  }

  /**
   * A card is about to appear mid-reply: the words said so far become their own message above
   * it, and the reveal carries on below it.
   */
  split(now: number, reduced = false) {
    const visible = this.visible(now, reduced)
    // At the card's own place in the words (the next word stays with the rest of the reply).
    const end = Math.max(this.base, Math.min(visible, this.releasing ?? visible))
    const said = this.text.slice(this.base, end).trim()
    this.base = end
    return said
  }

  /** The words on screen now. */
  shown(now: number, reduced = false) {
    return this.text.slice(this.base, Math.max(this.base, this.visible(now, reduced)))
  }

  reset() {
    this.voiced = false
    this.paced = false
    this.base = 0
    this.text = ''
    this.marks = []
    this.cues = []
    this.finished = false
  }

  get active() {
    return this.text.length > this.base || this.cues.length > 0 || this.finished
  }
}

/** Names a card goes by in speech (a chart title, a shop, item or supplier name). */
export function cardWords(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return []
  const words: string[] = []
  const take = (value: unknown) => {
    if (typeof value === 'string' && value.trim().length > 2 && value.length <= 60)
      words.push(value)
  }
  for (const key of ['title', 'label', 'item', 'name']) take(data[key])
  take((data.snapshot as { business?: { name?: unknown } } | undefined)?.business?.name)
  take((data.supplier as { name?: unknown } | undefined)?.name)
  return words
}
