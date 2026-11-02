/** Today leads with at most three things; the first is the one lead action (HABIT change 2). */
export const MAX_NEEDS = 3

/**
 * In the close window, closing the day keeps row 1: the playbook has no rank for it, and three
 * low-stock rows must never push the one daily ritual off Today (OB-235).
 */
export function closeDayFirst<T extends { kind: string }>(needs: T[]): T[] {
  return [
    ...needs.filter((need) => need.kind === 'closeDay'),
    ...needs.filter((need) => need.kind !== 'closeDay'),
  ]
}

/**
 * The morning (HABIT change 2 and 4): last night's promise leads, after closing the day in the
 * close window. Stock is one surface: the supply row with its run-out day keeps a place in the
 * three, so the playbook can never push the shop's one dated stock line off Today; a waiting
 * customer keeps one too, so in the evening Reply stays beside "Close the day".
 */
export function leadOrder<T extends { kind: string }>(needs: T[]): T[] {
  return leadSplit(needs).lead
}

/**
 * Rows that keep a place in the three whatever the playbook ranks: a waiting customer (a reply is
 * time-sensitive, so it is never behind "N more things") and the one dated stock line.
 */
function kept(need: { kind: string; supply?: boolean }): boolean {
  return (
    need.kind === 'reply' || need.kind === 'supply' || (need.kind === 'promise' && !!need.supply)
  )
}

/**
 * The three shown first, and the rest for "N more things" in the same card (SIMPLIFY Batch 5):
 * nothing the playbook ranks lower ever drops off Coach. The first row is never displaced; a kept
 * row takes the place of the lowest row that is not kept.
 */
export function leadSplit<T extends { kind: string; supply?: boolean }>(
  needs: T[],
): { lead: T[]; more: T[] } {
  const ordered = closeDayFirst([
    ...needs.filter((need) => need.kind === 'promise'),
    ...needs.filter((need) => need.kind !== 'promise'),
  ])
  const lead = ordered.slice(0, MAX_NEEDS)
  for (const need of ordered.slice(MAX_NEEDS).filter(kept)) {
    const out = lead.findLastIndex((each, index) => index > 0 && !kept(each))
    if (out < 0) break
    lead.splice(out, 1)
    lead.push(need)
  }
  lead.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b))
  return { lead, more: ordered.filter((need) => !lead.includes(need)) }
}
