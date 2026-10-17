import { expect, test } from '@playwright/test'
import { growOrderOf } from '../src/features/v1/playbook/growOrder.ts'

const ready = (view: { grow?: string[] | null } | undefined) => ({ kind: 'ready' as const, view })

test.describe('Grow order from the playbook', () => {
  test('uses the playbook grow list when present', () => {
    expect(growOrderOf(ready({ grow: ['recap', 'orders'] }))).toEqual(['recap', 'orders'])
  })

  test('falls back to the usual order when the view has no grow list', () => {
    expect(growOrderOf(ready({}))).toEqual([])
    expect(growOrderOf(ready(undefined))).toEqual([])
    expect(growOrderOf(ready({ grow: null }))).toEqual([])
  })

  test('is empty while loading or failed', () => {
    expect(growOrderOf({ kind: 'loading' })).toEqual([])
    expect(growOrderOf({ kind: 'failed' })).toEqual([])
  })
})
