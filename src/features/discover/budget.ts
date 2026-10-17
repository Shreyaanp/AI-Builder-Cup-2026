import { toMajor } from '../v1/format'
import type { RegionProfile } from '../../region/region'
import type { Place } from './types'

// Rough cost of a coffee or simple meal, in each currency's major units.
const cheapThreshold: Record<string, number> = {
  INR: 150,
  JPY: 800,
  USD: 8,
  EUR: 7,
  GBP: 6,
  SGD: 10,
  MYR: 15,
  IDR: 30_000,
  THB: 120,
  PHP: 200,
  VND: 60_000,
}

export function isBudget(place: Place): boolean {
  if (place.price_level === 'PRICE_LEVEL_INEXPENSIVE') return true
  const currency = place.currency?.toUpperCase() ?? ''
  const threshold = cheapThreshold[currency]
  return (
    threshold !== undefined &&
    place.items.some((item) => item.available && toMajor(item.price, currency) <= threshold)
  )
}

/** A budget for example searches ("coffee under S$3"), in major units of the region's money. */
export function askBudget(region: RegionProfile): number {
  if (region.country) return region.askBudget
  const cheap = cheapThreshold[region.currency]
  return cheap ? cheap / 2 : region.askBudget
}
