export type Box = { top: number; left: number; width: number; height: number }

const MARGIN = 16
const GAP = 12
const CARD_WIDTH = 380

/**
 * Where the tour card goes so it never covers its own spotlight. A phone puts it at the bottom,
 * or the top when the target is low; a desktop puts it beside the target, then below or above.
 * When nothing fits, the spotlight is trimmed to the space the card leaves.
 */
export function placeCard(
  target: Box,
  view: { width: number; height: number; safeBottom?: number },
  cardHeight: number,
): { spot: Box; card: { top: number; left: number; width: number } } {
  const { width: vw, height: vh } = view
  const phone = vw < 600
  const width = Math.min(CARD_WIDTH, vw - MARGIN * 2)
  const height = Math.min(cardHeight, vh - MARGIN * 2)
  const bottomTop = vh - MARGIN - (view.safeBottom ?? 0) - height
  const clampTop = (top: number) => Math.max(MARGIN, Math.min(top, vh - MARGIN - height))
  // Only the part of the target that is on screen can be lit.
  const top = Math.max(0, target.top)
  const spot: Box = { ...target, top, height: Math.min(target.top + target.height, vh) - top }
  const bottom = spot.top + spot.height
  const centred = Math.round((vw - width) / 2)

  if (!phone) {
    const right = spot.left + spot.width + GAP
    if (right + width + MARGIN <= vw)
      return { spot, card: { top: clampTop(spot.top), left: right, width } }
    const left = spot.left - GAP - width
    if (left >= MARGIN) return { spot, card: { top: clampTop(spot.top), left, width } }
    const along = Math.max(MARGIN, Math.min(spot.left, vw - MARGIN - width))
    if (bottom + GAP + height + MARGIN <= vh)
      return { spot, card: { top: bottom + GAP, left: along, width } }
    if (spot.top - GAP - height >= MARGIN)
      return { spot, card: { top: spot.top - GAP - height, left: along, width } }
    return trim(spot, bottomTop, { top: bottomTop, left: along, width })
  }

  if (bottom + GAP <= bottomTop) return { spot, card: { top: bottomTop, left: centred, width } }
  if (spot.top >= MARGIN + height + GAP)
    return { spot, card: { top: MARGIN, left: centred, width } }
  return trim(spot, bottomTop, { top: bottomTop, left: centred, width })
}

/** Cut the spotlight off above a card that sits below it. */
function trim(spot: Box, cardTop: number, card: { top: number; left: number; width: number }) {
  return { spot: { ...spot, height: Math.max(48, cardTop - GAP - spot.top) }, card }
}
