import { useCallback } from 'react'
import { useLocale } from '../../state/hooks'
import { useShopCopy } from '../shop/strings'
import { unitLabel } from '../shop/units'

/** An order's unit: as saved in English ("12 l"), in the owner's words otherwise ("12 लीटर"). */
export function useOrderUnit(): (raw: string) => string {
  const locale = useLocale()
  const shopCopy = useShopCopy()
  return useCallback(
    (raw: string) => (locale.startsWith('en') ? raw : unitLabel(raw, shopCopy)),
    [locale, shopCopy],
  )
}
