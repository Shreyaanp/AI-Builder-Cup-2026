import type { Business } from '../v1/api'
import type { components } from '../../api/generated'

export const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayHours = components['schemas']['DayHours']

export function hasHours(fields: Business['fields']): boolean {
  return Boolean(fields.weekly_hours?.length || fields.hours.trim())
}
