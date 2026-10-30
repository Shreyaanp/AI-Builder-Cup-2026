import { useEffect, useState } from 'react'
import { Box, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material'
import { useLocale } from '../../state/hooks'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import type { components } from '../../api/generated'
import { useDemoCopy } from '../frontdoors/strings'

type Status = components['schemas']['ReminderStatus'] & { demo?: boolean }

async function subscriptionId(subscription: PushSubscription): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(subscription.endpoint),
  )
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function supported() {
  return (
    window.isSecureContext &&
    'Notification' in window &&
    'PushManager' in window &&
    'serviceWorker' in navigator
  )
}

export function ReminderSettings() {
  const t = useCopy()
  const demoCopy = useDemoCopy()
  const locale = useLocale()
  const { api, active } = useWorkspace()
  const [status, setStatus] = useState<Status | null>(null)
  const [sid, setSid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The kind, not the words: switching language re-words it instead of reloading the status.
  const [problem, setProblem] = useState<'' | 'failed' | 'denied'>('')
  const message =
    problem === 'failed' ? t.reminderFailed : problem === 'denied' ? t.reminderDenied : ''
  const [attempt, setAttempt] = useState(0)
  const enabled = !!sid && !!status?.subscriptions.includes(sid)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const next = await api<Status>('/reminders')
        const registration =
          !next.demo && supported() ? await navigator.serviceWorker.getRegistration('/') : null
        const subscription = await registration?.pushManager.getSubscription()
        const id = subscription ? await subscriptionId(subscription) : null
        if (!cancelled) {
          setStatus(next)
          setSid(next.demo && next.subscriptions.includes('demo') ? 'demo' : id)
          setProblem('')
        }
      } catch {
        if (!cancelled) setProblem('failed')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [api, attempt])

  async function toggle(checked: boolean) {
    if (busy || !status) return
    setBusy(true)
    setProblem('')
    try {
      if (status.demo) {
        const next = await api<Status>('/reminders', {
          method: 'PUT',
          body: JSON.stringify({ enabled: checked }),
        })
        setStatus(next)
        setSid(checked ? 'demo' : null)
        return
      }
      if (!checked && sid) {
        // Remove on the server first. A failed browser cleanup must not keep sending pushes.
        await api('/reminders/' + sid, { method: 'DELETE' })
        setStatus({ ...status, subscriptions: status.subscriptions.filter((id) => id !== sid) })
        const registration = await navigator.serviceWorker.getRegistration('/')
        await (await registration?.pushManager.getSubscription())?.unsubscribe()
        setSid(null)
        return
      }
      if (!checked || !active || !status.enabled || !supported()) return
      // This is the only permission request, called directly by the owner's Remind me tap.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setProblem('denied')
        return
      }
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('timeout')), 10_000),
        ),
      ])
      let subscription = await registration.pushManager.getSubscription()
      const created = !subscription
      if (!subscription) {
        const key = Uint8Array.from(
          atob(status.public_key.replace(/-/g, '+').replace(/_/g, '/')),
          (c) => c.charCodeAt(0),
        )
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        })
      }
      try {
        await api('/reminders', {
          method: 'PUT',
          body: JSON.stringify({
            business_id: active.id,
            locale,
            subscription: subscription.toJSON(),
          }),
        })
      } catch (error) {
        if (created) await subscription.unsubscribe()
        throw error
      }
      const id = await subscriptionId(subscription)
      setSid(id)
      setStatus({ ...status, subscriptions: [...status.subscriptions, id] })
    } catch {
      setProblem('failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box sx={{ px: 3, py: 1 }}>
      <FormControlLabel
        sx={{ m: 0, width: '100%', justifyContent: 'space-between', minHeight: 48, gap: 2 }}
        labelPlacement="start"
        label={t.remindMe}
        control={
          <Switch
            checked={enabled}
            disabled={
              busy ||
              !status ||
              (!enabled && (!status.enabled || !active || (!status.demo && !supported())))
            }
            onChange={(_, checked) => void toggle(checked)}
            slotProps={{ input: { 'aria-describedby': 'reminder-status' } }}
          />
        }
      />
      <Stack spacing={1}>
        <Typography id="reminder-status" role="status" variant="bodySmall" color="text.secondary">
          {message ||
            (status?.demo
              ? demoCopy.readOnly
              : busy
                ? t.reminderSaving
                : !status
                  ? t.reminderLoading
                  : !status.enabled
                    ? t.reminderOff
                    : !supported()
                      ? t.reminderUnsupported
                      : !active
                        ? t.reminderShop
                        : t.reminderTiming)}
        </Typography>
        {message && (
          <Button onClick={() => setAttempt(attempt + 1)} sx={{ alignSelf: 'flex-start' }}>
            {t.retry}
          </Button>
        )}
      </Stack>
    </Box>
  )
}
