type PlaybookLike =
  { kind: 'ready'; view?: { grow?: string[] | null } } | { kind: 'loading' | 'failed' }

/** The playbook's suggested Grow order. Empty until it is ready, and when the server's view has
 * no `grow` list (older playbooks), so Grow keeps its usual order instead of crashing. */
export function growOrderOf(playbook: PlaybookLike): string[] {
  return playbook.kind === 'ready' && Array.isArray(playbook.view?.grow)
    ? playbook.view.grow.filter((id): id is string => typeof id === 'string')
    : []
}

/** The last Grow order each shop's playbook gave in this page load (tool ids only). */
const lastOrder = new Map<string, string[]>()
/** How long a first Grow visit waits for the playbook before showing the usual order. */
export const GROW_ORDER_WAIT_MS = 1000

/**
 * Grow's rows keep one order for the whole visit, so a row never moves under the owner's finger
 * (a playbook that answered after the rows showed moved "Get on Google" mid-tap; the tap was
 * lost). A visit uses the shop's last known order; a newer one applies on the next visit.
 */
export function rememberedGrowOrder(shop: string | null | undefined): string[] | undefined {
  return shop ? lastOrder.get(shop) : undefined
}

export function rememberGrowOrder(shop: string | null | undefined, playbook: PlaybookLike) {
  if (shop && playbook.kind === 'ready') lastOrder.set(shop, growOrderOf(playbook))
}
