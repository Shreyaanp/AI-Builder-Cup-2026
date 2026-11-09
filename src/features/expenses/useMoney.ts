import { useCallback, useEffect, useState } from 'react'
import type { components } from '../../api/generated'
import { useWorkspace } from '../v1/workspaceContext'

export type MoneyDay = components['schemas']['MoneyDay']
export type MoneyWeek = components['schemas']['MoneyWeek']
export type Expense = components['schemas']['Expense']
export type ExpenseBody = {
  amount: number
  category: Expense['category']
  note: string
  method: Expense['method']
  date?: string
  order_id?: string
}

/**
 * One day's expenses, sales and cash in hand. Every change answers with the whole day, so the
 * screen always shows what the server saved (the same figures the chat and Today read).
 */
export function useMoney(day: string) {
  const { api, active } = useWorkspace()
  const id = active?.id
  const [data, setData] = useState<MoneyDay | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const base = id ? `/businesses/${encodeURIComponent(id)}` : ''
  useEffect(() => {
    if (!base) return
    const controller = new AbortController()
    void api<MoneyDay>(`${base}/money?day=${day}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [api, base, day, attempt])
  const send = useCallback(
    async (path: string, method: string, body?: unknown) => {
      const result = await api<MoneyDay>(`${base}${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      // An expense for another day answers with that day: read this one again instead.
      if (result.date === day) setData(result)
      else setAttempt((n) => n + 1)
      return result
    },
    [api, base, day],
  )
  return {
    data: data && data.date === day ? data : null,
    failed,
    refresh: () => setAttempt((n) => n + 1),
    add: (body: ExpenseBody) => send('/expenses', 'POST', { date: day, ...body }),
    edit: (expense: Expense, body: Partial<ExpenseBody>) =>
      send(`/expenses/${day}/${encodeURIComponent(expense.id)}`, 'PATCH', body),
    remove: (expense: Expense) =>
      send(`/expenses/${day}/${encodeURIComponent(expense.id)}`, 'DELETE'),
    restore: (expense: Expense) =>
      send(`/expenses/${day}/${encodeURIComponent(expense.id)}/restore`, 'POST'),
    cash: (body: { opening?: number | null; counted?: number | null; upi_sales?: number | null }) =>
      send(`/money/${day}/cash`, 'PUT', body),
  }
}

/** The last seven days to `end`: sales, spent and what is left. */
export function useMoneyWeek() {
  const { api, active } = useWorkspace()
  const id = active?.id
  const [data, setData] = useState<MoneyWeek | null>(null)
  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    void api<MoneyWeek>(`/businesses/${encodeURIComponent(id)}/money/week`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setData(result)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [api, id])
  return data
}
