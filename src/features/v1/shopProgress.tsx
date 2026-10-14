import { Camera, Globe, PencilLine, Share2 } from 'lucide-react'
import type { ReactElement } from 'react'
import type { Copy } from './strings'
import type { Workspace } from './workspaceContext'

export interface Step {
  id: string
  title: string
  body: string
  action: string
  icon: ReactElement
  run: () => void
}

/** The single most useful next step for this shop — never a list of chores. */
export function nextStep(ws: Workspace, t: Copy): Step {
  const shop = ws.active
  if (!shop)
    return {
      id: 'scan',
      title: t.nextScan,
      body: t.nextScanBody,
      action: t.nextScanAction,
      icon: <Camera size={20} />,
      run: ws.requestPhoto,
    }
  if (ws.products.length === 0)
    return {
      id: 'prices',
      title: t.nextPrices,
      body: t.nextPricesBody,
      action: t.nextPricesAction,
      icon: <Camera size={20} />,
      run: ws.requestPhoto,
    }
  const missing = (['hours', 'location', 'phone', 'category'] as const).find(
    (key) => !shop.fields[key].trim(),
  )
  if (missing)
    return {
      id: 'field-' + missing,
      title: t.nextField(t.fields[missing]),
      body: t.nextFieldBody,
      action: t.nextFieldAction,
      icon: <PencilLine size={20} />,
      run: () => ws.openEditor({ kind: 'business', fields: shop.fields }),
    }
  if (!shop.public)
    return {
      id: 'share',
      title: t.nextShare,
      body: t.nextShareBody,
      action: t.nextShareAction,
      icon: <Share2 size={20} />,
      run: () => ws.go('shop'),
    }
  return {
    id: 'google',
    title: t.nextGoogle,
    body: t.nextGoogleBody,
    action: t.nextGoogleAction,
    icon: <Globe size={20} />,
    run: () => ws.go('google'),
  }
}

/** Same six checks as the Google readiness list. */
export function readiness(ws: Workspace): { done: number; total: number } {
  const shop = ws.active
  if (!shop) return { done: 0, total: 6 }
  const fields = (['name', 'category', 'location', 'hours', 'phone'] as const).filter((key) =>
    shop.fields[key].trim(),
  ).length
  return { done: fields + (ws.products.length > 0 ? 1 : 0), total: 6 }
}
