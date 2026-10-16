import { Camera, Globe, PencilLine, Share2 } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ShopFacts } from './api'
import type { Copy } from './strings'
import type { Workspace } from './workspaceContext'
import { hasHours, weekdays, type DayHours } from '../shop/hoursModel'
import { factName } from './factNames'

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
  const missing = (['hours', 'location', 'phone', 'category'] as const).find((key) =>
    key === 'hours' ? !hasHours(shop.fields) : !shop.fields[key].trim(),
  )
  if (missing)
    return {
      id: 'field-' + missing,
      title: t.nextField(t.fields[missing]),
      body: t.nextFieldBody,
      action: t.nextFieldAction,
      icon: <PencilLine size={20} />,
      run: () => ws.openEditor({ kind: 'business', fields: shop.fields, step: missing }),
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
export function openNow(
  hours: string,
  now = new Date(),
  weeklyHours?: DayHours[],
  timezone?: string,
): boolean | null {
  const parts = timezone
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(now)
    : null
  const part = (key: string) => parts?.find((p) => p.type === key)?.value ?? ''
  const current = parts
    ? Number(part('hour')) * 60 + Number(part('minute'))
    : now.getHours() * 60 + now.getMinutes()
  if (weeklyHours?.length) {
    const index = parts
      ? weekdays.indexOf(part('weekday').toLowerCase() as DayHours['day'])
      : (now.getDay() + 6) % 7
    const today = weeklyHours.find((entry) => entry.day === weekdays[index])
    const previous = weeklyHours.find((entry) => entry.day === weekdays[(index + 6) % 7])
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    if (
      previous &&
      !previous.closed &&
      previous.open &&
      previous.close &&
      previous.open > previous.close &&
      current < minutes(previous.close)
    )
      return true
    if (!today) return null
    if (today.closed) return false
    if (!today.open || !today.close) return null
    const start = minutes(today.open),
      end = minutes(today.close)
    return start < end ? current >= start && current < end : current >= start
  }
  const range =
    /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i
  const match = range.exec(hours)
  if (!match) return null
  const rest = hours.replace(match[0], '').replace(/\b(daily|every\s*day)\b/gi, '')
  if (/[\p{L}\d]/u.test(rest)) return null
  // "7-3pm": the first time borrows the second's am/pm only when that keeps it before close.
  const close = toMinutes(match[4], match[5], match[6])
  let start = toMinutes(match[1], match[2], match[3] ?? match[6])
  if (!match[3] && match[6] && start > close) start = toMinutes(match[1], match[2], 'am')
  if (start > 24 * 60 || close > 24 * 60 || start === close) return null
  return start < close ? current >= start && current < close : current >= start || current < close
}

/** Customer facts in the order the coach asks about them (matches backend ASK_ORDER). */
export const ASK_ORDER = [
  'halal',
  'payment_methods',
  'delivery',
  'vegetarian_options',
  'locally_made',
  'preorders',
  'busy_hours',
] as const
export type AskFact = (typeof ASK_ORDER)[number]

// Mirrors FOOD in backend/app/business_profile.py: food facts only for food and drink shops.
const FOOD =
  /food|kopi|coffee|cafe|café|tea|bakery|bake|cake|hawker|stall|restaurant|eat|kitchen|noodle|rice|bar|drink|juice|dessert|食|餐|咖啡|面包|茶|อาหาร|กาแฟ|ขนมปัง|ชา|カフェ|パン|コーヒー|レストラン|음식|카페|커피|식당|빵|makan|kedai kopi|warung|restoran|roti|minuman|nhà hàng|quán|cà phê|trà|bánh mì|kainan|karinderya|pagkain|kape|panaderya|tsaa|உணவு|காபி|தேநீர்|பேக்கரி|dhaba|mess|tiffin|chai|भोजन|खाना|चाय|ढाबा|मिठाई|टिफिन|नाश्ता/i
const FOOD_ONLY: AskFact[] = ['halal', 'vegetarian_options', 'delivery', 'preorders']

export function missingFacts(fields: ShopFacts & { category?: string; name?: string }): AskFact[] {
  // Unknown type yet: ask everything; food questions drop once the category says otherwise.
  const food = !fields.category?.trim() || FOOD.test(`${fields.category} ${fields.name ?? ''}`)
  return ASK_ORDER.filter((key) => {
    if (!food && FOOD_ONLY.includes(key)) return false
    const value = fields[key]
    return value == null || value === '' || (Array.isArray(value) && value.length === 0)
  })
}

/** Stated facts as owner-facing label/value pairs (unset facts are skipped). */
export function factEntries(
  fields: ShopFacts,
  t: Copy,
): { key: AskFact; label: string; value: string }[] {
  const yesNo = (value: boolean) => (value ? t.yes : t.no)
  const entries: { key: AskFact; value: string }[] = []
  // Under the "Halal" label a plain Yes / No reads better than repeating "Halal".
  if (fields.halal)
    entries.push({
      key: 'halal',
      value:
        fields.halal === 'yes' ? t.yes : fields.halal === 'no' ? t.no : t.halalValues[fields.halal],
    })
  if (fields.payment_methods?.length)
    entries.push({
      key: 'payment_methods',
      value: fields.payment_methods.map((method) => factName(method, t.paymentValues)).join(', '),
    })
  if (fields.delivery)
    entries.push({
      key: 'delivery',
      value: [factName(fields.delivery, t.deliveryValues), fields.delivery_note]
        .filter(Boolean)
        .join(' · '),
    })
  if (fields.vegetarian_options != null)
    entries.push({ key: 'vegetarian_options', value: yesNo(fields.vegetarian_options) })
  if (fields.locally_made != null)
    entries.push({ key: 'locally_made', value: yesNo(fields.locally_made) })
  if (fields.preorders != null)
    entries.push({
      key: 'preorders',
      value: [yesNo(fields.preorders), fields.preorders && fields.preorder_lead_time]
        .filter(Boolean)
        .join(' · '),
    })
  if (fields.busy_hours) entries.push({ key: 'busy_hours', value: fields.busy_hours })
  return entries.map((entry) => ({ ...entry, label: t.factNames[entry.key] }))
}

/** Every "HH[:MM][am|pm]–HH[:MM][am|pm]" range in free text, as minutes since midnight. */
export function timeRanges(text: string): [number, number][] {
  const range =
    /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/gi
  const ranges: [number, number][] = []
  for (const match of text.matchAll(range)) {
    const close = toMinutes(match[4], match[5], match[6])
    let start = toMinutes(match[1], match[2], match[3] ?? match[6])
    if (!match[3] && match[6] && start > close) start = toMinutes(match[1], match[2], 'am')
    if (start < close && close <= 24 * 60) ranges.push([start, close])
  }
  return ranges
}

function toMinutes(hour = '0', minute: string | undefined, half: string | undefined) {
  let h = Number(hour) % (half ? 12 : 24)
  if (half?.toLowerCase() === 'pm') h += 12
  return h * 60 + Number(minute ?? 0)
}

/** Default lunch and dinner rushes when the owner has not said when the shop is busy. */
const DEFAULT_BUSY: [number, number][] = [
  [11 * 60, 14 * 60],
  [17 * 60, 20 * 60],
]

/** The busy window the shop is in right now ("start-end" key), or null outside busy hours. */
export function busyWindow(busyHours: string | undefined, now = new Date()): string | null {
  const parsed = timeRanges(busyHours ?? '')
  const current = now.getHours() * 60 + now.getMinutes()
  const window = (parsed.length ? parsed : DEFAULT_BUSY).find(
    ([start, end]) => current >= start && current < end,
  )
  return window ? `${window[0]}-${window[1]}` : null
}

/** Same six checks as the Google readiness list. */
export function readiness(ws: Workspace): { done: number; total: number } {
  const shop = ws.active
  if (!shop) return { done: 0, total: 6 }
  const fields = (['name', 'category', 'location', 'hours', 'phone'] as const).filter((key) =>
    key === 'hours' ? hasHours(shop.fields) : shop.fields[key].trim(),
  ).length
  return { done: fields + (ws.products.length > 0 ? 1 : 0), total: 6 }
}
