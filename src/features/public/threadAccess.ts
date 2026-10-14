import type { components } from '../../api/generated'
export type ThreadAccess = Pick<components['schemas']['InquiryReceipt'], 'id' | 'token'>
export function accessKey(shop: string) {
  return `ogoogle.customer.thread.${shop}`
}
export function readAccess(shop: string): ThreadAccess | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(accessKey(shop)) || 'null')
    if (
      value &&
      typeof value === 'object' &&
      'id' in value &&
      'token' in value &&
      typeof value.id === 'string' &&
      typeof value.token === 'string'
    )
      return { id: value.id, token: value.token }
  } catch {
    /* Chat still works without browser persistence. */
  }
  return null
}
