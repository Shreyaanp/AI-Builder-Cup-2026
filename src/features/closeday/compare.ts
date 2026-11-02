/**
 * Which comparison line a day's difference reads as. The line shows whole units, so a difference
 * under half a unit would read "₹0 more": it is the same as last time.
 */
export function comparisonKind(differenceMajor: number): 'more' | 'less' | 'same' {
  if (Math.abs(differenceMajor) < 0.5) return 'same'
  return differenceMajor > 0 ? 'more' : 'less'
}
