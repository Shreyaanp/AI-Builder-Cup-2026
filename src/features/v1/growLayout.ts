import { createContext, useContext, useLayoutEffect } from 'react'

/**
 * How a Tile draws itself: a card (Shop), a list row (Grow), or a named icon in Grow's More
 * tools grid. Each tool keeps its own tile component and sheet; only the drawing changes.
 */
export type TileLayout = 'card' | 'row' | 'tool'
export const TileLayoutContext = createContext<TileLayout>('card')

/** Inside a group: tells the group this tool is there (returns "gone"). */
type Seen = (label: string) => () => void
export const GroupContext = createContext<Seen | null>(null)

/** A tool in a group names itself on the group's row; a group with no tool shown hides. */
export function useInGroup(label: string, shown = true) {
  const seen = useContext(GroupContext)
  useLayoutEffect(() => (seen && shown ? seen(label) : undefined), [seen, label, shown])
}
