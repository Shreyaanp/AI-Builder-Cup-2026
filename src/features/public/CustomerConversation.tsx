import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { followInquiries } from '../../api/inquiryStream'
import { useLocale } from '../../state/hooks'
import { ConversationView } from '../inquiries/ConversationView'
import type { Thread, Translation } from '../inquiries/conversationCopy'
import { Sheet } from '../v1/Sheet'
import type { CustomerCopy } from './customerCopy'

import type { ThreadAccess } from './threadAccess'

export function CustomerConversation({
  shop,
  access,
  copy: t,
  onDeleted,
}: {
  shop: string
  access: ThreadAccess
  copy: CustomerCopy
  onDeleted: () => void
}) {
  const locale = useLocale()
  const [thread, setThread] = useState<Thread | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  const [lost, setLost] = useState(false)
  const [polling, setPolling] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const lifetime = useRef<AbortController | null>(null)
  const path = `/api/v1/public/shops/${encodeURIComponent(shop)}/inquiries/${encodeURIComponent(access.id)}`
  async function request<T>(suffix: string, method = 'GET', body?: unknown) {
    const response = await fetch(path + suffix, {
      method,
      credentials: 'omit',
      headers: {
        'X-Thread-Token': access.token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([
        lifetime.current?.signal ?? new AbortController().signal,
        AbortSignal.timeout(25_000),
      ]),
    })
    if (!response.ok) throw new Error(String(response.status))
    return response.json() as Promise<T>
  }
  useEffect(() => {
    const abort = new AbortController()
    lifetime.current = abort
    let timer: ReturnType<typeof setInterval> | undefined
    const load = async () => {
      try {
        const response = await fetch(path, {
          credentials: 'omit',
          headers: { 'X-Thread-Token': access.token },
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25_000)]),
        })
        if (response.status === 404) {
          setLost(true)
          return
        }
        if (!response.ok) throw new Error('Unavailable')
        const result = (await response.json()) as Thread
        if (!abort.signal.aborted) {
          setThread(result)
          setError(false)
        }
      } catch {
        if (!abort.signal.aborted) setError(true)
      }
    }
    void load()
    void followInquiries(
      (init) =>
        fetch(path + '/stream', {
          ...init,
          credentials: 'omit',
          headers: { ...init.headers, 'X-Thread-Token': access.token },
        }),
      abort.signal,
      (value) => {
        if (abort.signal.aborted) return
        if (value && typeof value === 'object' && 'unavailable' in value) {
          setLost(true)
          return
        }
        setThread(value as Thread)
        setError(false)
      },
    ).catch(() => {
      if (abort.signal.aborted) return
      setPolling(true)
      void load()
      timer = setInterval(() => {
        void load()
      }, 15_000)
    })
    return () => {
      abort.abort()
      clearInterval(timer)
    }
  }, [path, access.token])
  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)} sx={{ mt: 2 }}>
        {t.openChat}
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        titleId="customer-conversation-title"
        title={t.conversation}
        dismissInActions
        actions={<Button onClick={() => setOpen(false)}>{t.back}</Button>}
      >
        <Stack spacing={2}>
          {error && <Alert severity="error">{t.chatFailed}</Alert>}
          {polling && (
            <Typography role="status" variant="bodySmall">
              {t.polling}
            </Typography>
          )}
          {lost ? (
            <Alert severity="info">{t.lost}</Alert>
          ) : thread ? (
            <ConversationView
              thread={thread}
              viewer="customer"
              copy={t}
              onSend={async (text) => {
                setThread(await request<Thread>('/messages', 'POST', { text }))
              }}
              onTranslate={(id) =>
                request<Translation>(`/messages/${encodeURIComponent(id)}/translation`, 'POST', {
                  language: locale,
                })
              }
            />
          ) : (
            <Typography role="status" variant="bodyMedium">
              {t.chatLoading}
            </Typography>
          )}
          {lost ? (
            <Button onClick={onDeleted}>{t.back}</Button>
          ) : (
            <Button color="error" onClick={() => setConfirm(true)}>
              {t.remove}
            </Button>
          )}
          {confirm && (
            <Box role="group" aria-label={t.confirmDelete}>
              <Typography variant="bodyMedium">{t.confirmDelete}</Typography>
              <Button
                color="error"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(false)
                  try {
                    await request('', 'DELETE')
                    onDeleted()
                  } catch {
                    setError(true)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {t.remove}
              </Button>
              <Button disabled={busy} onClick={() => setConfirm(false)}>
                {t.cancel}
              </Button>
            </Box>
          )}
        </Stack>
      </Sheet>
    </>
  )
}
