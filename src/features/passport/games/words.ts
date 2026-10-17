import { fill, requirementText } from '../copy'
import type { PassportStrings } from '../copy'
import type { PassportView } from '../store'
import type { NextReward } from './api'
import type { GamesStrings } from './copy'

/** A collection set's name: its own, or the festival trail's from the passport strings. */
export function setName(id: string, t: GamesStrings, p: PassportStrings) {
  if (id.startsWith('festival:')) {
    const festival = id.slice('festival:'.length)
    return (p[festival as keyof PassportStrings] as string | undefined) ?? t.festivalTrail
  }
  return (t[id as keyof GamesStrings] as string | undefined) ?? id
}

/** The single next named reward, in words ("2 more stamps → free bun maska"). */
export function nextRewardText(
  next: NextReward,
  view: PassportView,
  t: GamesStrings,
  p: PassportStrings,
  number: (n: number) => string,
) {
  if (next.kind === 'card')
    return next.left > 0
      ? fill(next.left === 1 ? t.nextCardOne : t.nextCard, {
          n: number(next.left),
          reward: next.reward,
        })
      : fill(t.nextCardReady, { reward: next.reward })
  if (next.kind === 'set')
    return fill(t.nextSet, { n: number(next.left), set: setName(next.reward, t, p) })
  const requirement = view.level.next_requirement
  return requirement && view.level.next ? requirementText(requirement, view.level.next, p) : ''
}
