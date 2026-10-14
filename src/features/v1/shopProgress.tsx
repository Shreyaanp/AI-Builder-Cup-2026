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

/**
 * Open/closed from free-text hours, only when the text is one plain daily range such as
 * "07:00–14:00" or "7am-3pm". Anything else (days, several ranges) returns null: no guess.
 */
export function openNow(hours: string, now = new Date()): boolean | null {
  const range =
    /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i
  const match = range.exec(hours)
  if (!match) return null
  const rest = hours.replace(match[0], '').replace(/\b(daily|every\s*day)\b/gi, '')
  if (/[\p{L}\d]/u.test(rest)) return null
  const minutes = (hour = '0', minute: string | undefined, half: string | undefined) => {
    let h = Number(hour) % (half ? 12 : 24)
    if (half?.toLowerCase() === 'pm') h += 12
    return h * 60 + Number(minute ?? 0)
  }
  // "7-3pm": the first time borrows the second's am/pm only when that keeps it before close.
  const close = minutes(match[4], match[5], match[6])
  let start = minutes(match[1], match[2], match[3] ?? match[6])
  if (!match[3] && match[6] && start > close) start = minutes(match[1], match[2], 'am')
  if (start > 24 * 60 || close > 24 * 60 || start === close) return null
  const current = now.getHours() * 60 + now.getMinutes()
  return start < close ? current >= start && current < close : current >= start || current < close
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
