import type { RegionProfile } from '../../region/region'

/** Known saved keys keep their translated labels; custom names keep their spelling. */
export function factName(value: string, labels: Record<string, string>): string {
  return Object.hasOwn(labels, value) ? (labels[value] ?? value) : value
}

// Countries without a region profile yet (region.ts): suggestions from their currency.
const BY_CURRENCY: Record<string, { payment: string[]; delivery: string[] }> = {
  JPY: { payment: ['PayPay'], delivery: ['Uber Eats'] },
  PHP: { payment: ['GCash'], delivery: ['grab', 'foodpanda'] },
  MYR: { payment: ['Touch ’n Go'], delivery: ['grab', 'foodpanda'] },
  IDR: { payment: ['GoPay', 'OVO'], delivery: ['GoFood', 'grab'] },
}

/** Suggestions follow the shop's region (UPI in India, PayNow in Singapore); never limits. */
export function factSuggestions(region: RegionProfile) {
  const local = region.country
    ? { payment: region.payments, delivery: region.delivery }
    : BY_CURRENCY[region.currency]
  return {
    payment: [...new Set([...(local?.payment ?? []), 'card', 'cash'])],
    delivery: ['none', 'own', ...(local?.delivery ?? [])],
  }
}
