import { defaultCurrency } from './format'

/** Known saved keys keep their translated labels; custom names keep their spelling. */
export function factName(value: string, labels: Record<string, string>): string {
  return Object.hasOwn(labels, value) ? (labels[value] ?? value) : value
}

/** Suggestions follow the phone region, independently of the shop's stored currency. */
export function factSuggestions(currency = defaultCurrency()) {
  const regional: Record<string, { payment: string[]; delivery: string[] }> = {
    INR: { payment: ['UPI', 'Paytm', 'PhonePe'], delivery: ['Swiggy', 'Zomato'] },
    JPY: { payment: ['PayPay'], delivery: ['Uber Eats'] },
    PHP: { payment: ['GCash'], delivery: ['grab', 'foodpanda'] },
    SGD: { payment: ['paynow', 'nets', 'grabpay'], delivery: ['grab', 'foodpanda'] },
    MYR: { payment: ['Touch ’n Go'], delivery: ['grab', 'foodpanda'] },
    IDR: { payment: ['GoPay', 'OVO'], delivery: ['GoFood', 'grab'] },
  }
  const local = regional[currency]
  return {
    payment: [...(local?.payment ?? []), 'card', 'cash'],
    delivery: ['none', 'own', ...(local?.delivery ?? [])],
  }
}
