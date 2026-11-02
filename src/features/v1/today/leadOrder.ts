/** Today shows at most three things; the first is the one lead action (HABIT change 2). */
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
 * three, so the playbook can never push the shop's one dated stock line off Today.
 */
export function leadOrder<T extends { kind: string }>(needs: T[]): T[] {
  const ordered = closeDayFirst([
    ...needs.filter((need) => need.kind === 'promise'),
    ...needs.filter((need) => need.kind !== 'promise'),
  ])
  const top = ordered.slice(0, MAX_NEEDS)
  const supply = ordered.find((need) => need.kind === 'supply')
  if (!supply || top.includes(supply)) return top
  return [...top.slice(0, MAX_NEEDS - 1), supply]
}
