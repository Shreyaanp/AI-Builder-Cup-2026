import { useCallback, useEffect, useRef, useState } from 'react'
import { SpeechTimeline } from './speechReveal'

/** Frame rate of the reveal: smooth enough for words, cheap enough for a phone. */
const TICK_MS = 50
// A turn whose end never came (the socket dropped mid-reply): once its words have been said
// and nothing more arrived for this long after them, it is complete.
const STALL_MS = 6000

/**
 * The coach's reply revealed in step with its voice (see `speechReveal.ts`).
 *
 * `remaining()` is the milliseconds of coach audio still queued to play (null: no audio clock,
 * reveal at a speaking rate). `onDone` receives the whole reply once it has been spoken; `onEnd`
 * follows every finished turn, words or not.
 */
export function useSpokenReveal({
  remaining,
  reducedMotion,
  onDone,
  onEnd,
}: {
  remaining: () => number | null
  reducedMotion: boolean
  onDone: (text: string) => void
  onEnd?: () => void
}) {
  const timeline = useRef(new SpeechTimeline())
  const [shown, setShown] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const lastPush = useRef(0)
  const latest = useRef({ remaining, reducedMotion, onDone, onEnd })
  useEffect(() => {
    latest.current = { remaining, reducedMotion, onDone, onEnd }
  })

  const tick = useCallback(function tick() {
    const line = timeline.current
    const now = performance.now()
    const { reducedMotion: reduced, onDone: done, onEnd: end, remaining: queued } = latest.current
    if (
      line.text &&
      !line.isFinished &&
      now - Math.max(lastPush.current, line.endsAt()) > STALL_MS &&
      line.spoken(now) >= line.text.length &&
      !queued()
    )
      line.finish(now)
    line.sync(now, queued())
    line.release(now, reduced)
    const text = line.shown(now, reduced)
    setShown((current) => (current === text ? current : text))
    if (line.done(now)) {
      const whole = line.flush()
      window.clearInterval(timer.current)
      timer.current = undefined
      setShown('')
      if (whole) done(whole)
      end?.()
    }
  }, [])
  const run = useCallback(() => {
    if (timer.current === undefined) timer.current = window.setInterval(tick, TICK_MS)
  }, [tick])
  useEffect(() => () => window.clearInterval(timer.current), [])

  /** The whole transcript so far; a new turn after a finished one completes the old one. */
  const push = useCallback(
    (text: string) => {
      const line = timeline.current
      if (line.isFinished) {
        const whole = line.flush()
        if (whole) latest.current.onDone(whole)
        latest.current.onEnd?.()
      }
      lastPush.current = performance.now()
      line.update(text, lastPush.current, latest.current.remaining())
      run()
      tick()
    },
    [run, tick],
  )
  /** A card the reply refers to: `show` runs when the voice reaches it. */
  const cue = useCallback(
    (show: () => void, words: (string | RegExp)[] = [], from?: number) => {
      timeline.current.cue(show, words, from)
      run()
    },
    [run],
  )
  /** The turn's words are all in; `onDone` follows once they have been spoken. */
  const finish = useCallback(() => {
    timeline.current.finish(performance.now())
    run()
    tick()
  }, [run, tick])
  /** Barge-in or stop: returns what was actually said (the rest is never shown). */
  const cut = useCallback(() => {
    const said = timeline.current.cut(performance.now(), latest.current.reducedMotion)
    window.clearInterval(timer.current)
    timer.current = undefined
    setShown('')
    return said
  }, [])
  /** Everything at once (the session ended normally while the words were catching up). */
  const flush = useCallback(() => {
    const whole = timeline.current.flush()
    window.clearInterval(timer.current)
    timer.current = undefined
    setShown('')
    return whole
  }, [])
  /** A card is appearing: the words said so far, to show as their own message above it. */
  const split = useCallback(() => {
    const said = timeline.current.split(performance.now(), latest.current.reducedMotion)
    setShown('')
    return said
  }, [])
  /** Drop the reply and its cards (a new chat, another conversation). */
  const discard = useCallback(() => {
    timeline.current.reset()
    window.clearInterval(timer.current)
    timer.current = undefined
    setShown('')
  }, [])
  const active = useCallback(() => timeline.current.active, [])
  /** The transcript received so far (spoken or not). */
  const heard = useCallback(() => timeline.current.text, [])
  return { shown, push, cue, finish, cut, flush, split, discard, active, heard }
}
