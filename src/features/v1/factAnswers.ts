import type { AskFact } from './shopProgress'

/** Customer facts a tap answers (yes / no): the coach asks the same ones in chat. */
const YES_NO = new Set<AskFact>(['halal', 'vegetarian_options', 'locally_made', 'preorders'])

export function isYesNoFact(fact: AskFact | undefined): fact is AskFact {
  return fact !== undefined && YES_NO.has(fact)
}
