import { useSyncExternalStore } from 'react'

const key = 'chalkboard.customer.rewards.v1'
const change = 'chalkboard-rewards-change'
const empty = '{"shops":{},"days":[],"streak":false,"early":false,"reminders":[]}'
export interface Rewards {
  shops: Record<string, { stamps: number; lastStamp: number | null }>
  days: number[]
  streak: boolean
  early: boolean
  reminders: { shop: string; name: string; unit: string; expires: number }[]
}
let unavailable = false
export const celebrations = new Set<string>()

function snapshot() {
  try {
    return localStorage.getItem(key) ?? empty
  } catch {
    return empty
  }
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener(change, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(change, callback)
  }
}
function read(raw = snapshot()): Rewards {
  try {
    const data = JSON.parse(raw) as Rewards
    if (
      !data ||
      !data.shops ||
      Array.isArray(data.shops) ||
      typeof data.shops !== 'object' ||
      !Array.isArray(data.days) ||
      !Array.isArray(data.reminders)
    )
      throw Error()
    const shops = Object.fromEntries(
      Object.entries(data.shops).filter(
        ([id, shop]) =>
          /^[0-9a-f-]{36}$/i.test(id) &&
          shop &&
          Number.isSafeInteger(shop.stamps) &&
          shop.stamps >= 0 &&
          (shop.lastStamp === null || Number.isSafeInteger(shop.lastStamp)),
      ),
    )
    return {
      shops,
      days: data.days.filter(Number.isSafeInteger).slice(-30),
      streak: data.streak === true,
      early: data.early === true,
      reminders: data.reminders
        .filter(
          (r) =>
            r &&
            typeof r.shop === 'string' &&
            typeof r.name === 'string' &&
            typeof r.unit === 'string' &&
            Number.isFinite(r.expires) &&
            r.expires > Date.now(),
        )
        .slice(0, 100),
    }
  } catch {
    return JSON.parse(empty) as Rewards
  }
}
function save(data: Rewards) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    unavailable = false
  } catch {
    unavailable = true
  }
  window.dispatchEvent(new Event(change))
  return !unavailable
}
export function useRewards() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => empty)
  const failed = useSyncExternalStore(
    subscribe,
    () => unavailable,
    () => false,
  )
  return { data: read(raw), unavailable: failed }
}

/** Calendar days avoid DST/elapsed-hour drift. This is an honest on-device visit record. */
export function visit(shop: string, qr: boolean, timeZone: string) {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const day = Date.UTC(part('year'), part('month') - 1, part('day')) / 86_400_000
  const data = read()
  const card = data.shops[shop] ?? { stamps: 0, lastStamp: null }
  if (qr && (card.lastStamp === null || day > card.lastStamp)) {
    card.stamps += 1
    card.lastStamp = day
    if ([5, 10].includes(card.stamps)) celebrations.add(shop)
  }
  data.shops[shop] = card
  if (!data.days.includes(day)) data.days = [...data.days, day].sort((a, b) => a - b).slice(-30)
  data.streak ||= data.days.some((d) => data.days.includes(d - 1) && data.days.includes(d - 2))
  data.early ||= part('hour') < 9
  save(data)
}

export function remind(shop: string, name: string, unit: string, expires: number) {
  const data = read()
  data.reminders = data.reminders.filter(
    (r) => !(r.shop === shop && r.name === name && r.unit === unit),
  )
  data.reminders.push({ shop, name, unit, expires })
  return save(data)
}
export function deviceId() {
  const deviceKey = 'chalkboard.customer.reminder-device'
  const prior = localStorage.getItem(deviceKey)
  if (prior && /^[0-9a-f-]{36}$/i.test(prior)) return prior
  const id = crypto.randomUUID()
  localStorage.setItem(deviceKey, id)
  return id
}
