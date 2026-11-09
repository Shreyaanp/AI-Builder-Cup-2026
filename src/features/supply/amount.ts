import { useLocale } from '../../state/hooks'
import { parseCloseDayNumber } from '../closeday/parseNumber'

/** The units an amount can be said in: kilos and grams convert, packs stay packs. */
export function unitChoices(unit: string): string[] {
  if (unit === 'kg' || unit === 'g') return ['kg', 'g']
  if (unit === 'litre' || unit === 'ml') return ['litre', 'ml']
  return unit ? [unit] : ['kg', 'g', 'litre', 'ml', 'pack', 'piece']
}

/** An amount as the owner types it (1,000 or 2.5), in their language; null when it is not one. */
export function useReadAmount() {
  const locale = useLocale()
  return (text: string) => {
    const value = parseCloseDayNumber(text, locale, 'USD')
    return value && value > 0 ? value : null
  }
}
