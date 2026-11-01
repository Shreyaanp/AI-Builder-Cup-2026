import { useEffect, useState } from 'react'
import { Alert, Box, Button, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import { useWorkspace } from '../../v1/workspaceContext'
import type { PerkTrigger } from './api'
import { useGamesCopy } from './copy'

type Perk = { id: string; trigger: PerkTrigger; text: string; active?: boolean }

// The thank-yous an owner is most likely to offer come first.
const TRIGGERS: PerkTrigger[] = [
  'third_visit',
  'tip',
  'follow',
  'scratch',
  'set_complete',
  'regular',
  'full_card',
  'quest_finale',
  'rescue_hero',
]

/**
 * The owner's thank-you perks (reciprocity): one short line per
 * moment, blank to skip. Calm owner UI: plain fields, one save button, no game motion.
 */
export function OwnerPerks() {
  const t = useGamesCopy()
  const ws = useWorkspace()
  const shop = ws.active?.id ?? null
  const api = ws.api
  const [loaded, setLoaded] = useState<{ shop: string; perks: Perk[] } | null>(null)
  const [texts, setTexts] = useState<Partial<Record<PerkTrigger, string>>>({})
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'load-error'>(
    'idle',
  )
  useEffect(() => {
    if (!shop) return
    let live = true
    api<{ perks: Perk[] }>(`/businesses/${encodeURIComponent(shop)}/perks`)
      .then(({ perks }) => {
        if (!live) return
        setLoaded({ shop, perks })
        setTexts(Object.fromEntries(perks.map((perk) => [perk.trigger, perk.text])))
      })
      .catch(() => {
        if (!live) return
        if (ws.readOnlyMessage) {
          setLoaded({ shop, perks: [] })
        } else {
          setState('load-error')
        }
      })
    return () => {
      live = false
    }
  }, [api, shop, ws.readOnlyMessage])
  if (!shop) return null
  const ready = loaded?.shop === shop
  async function save() {
    if (!shop || !loaded) return
    setState('saving')
    const perks = TRIGGERS.flatMap((trigger) => {
      const text = (texts[trigger] ?? '').trim()
      if (text.length < 3) return []
      const before = loaded.perks.find((perk) => perk.trigger === trigger)
      return [{ id: before?.id ?? trigger.replace(/_/g, '-'), trigger, text, active: true }]
    })
    try {
      const saved = await api<{ perks: Perk[] }>(`/businesses/${encodeURIComponent(shop)}/perks`, {
        method: 'PUT',
        body: JSON.stringify({ perks }),
      })
      setLoaded({ shop, perks: saved.perks })
      setState('idle')
      ws.notify(t.ownerSaved)
    } catch {
      setState('error')
    }
  }
  return (
    <Box component="section" aria-labelledby="owner-perks-title">
      <Typography id="owner-perks-title" component="h3" variant="titleMedium">
        {t.ownerPerksTitle}
      </Typography>
      <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 1 }}>
        {t.ownerPerksBody}
      </Typography>
      {!ready && state !== 'load-error' && (
        <LinearProgress sx={{ mt: 3 }} aria-label={t.ownerPerksTitle} />
      )}
      {state === 'load-error' && (
        <Alert severity={ws.readOnlyMessage ? 'info' : 'warning'} sx={{ mt: 3 }}>
          {ws.readOnlyMessage ?? t.ownerFailed}
        </Alert>
      )}
      {ready && (
        <Stack spacing={3} sx={{ mt: 3 }}>
          {TRIGGERS.map((trigger) => (
            <TextField
              key={trigger}
              label={t[`trigger_${trigger}`]}
              placeholder={t.ownerPerkHint}
              value={texts[trigger] ?? ''}
              onChange={(event) => setTexts({ ...texts, [trigger]: event.target.value })}
              slotProps={{ htmlInput: { maxLength: 80 } }}
              fullWidth
            />
          ))}
          {state === 'error' && (
            <Alert severity={ws.readOnlyMessage ? 'info' : 'error'}>
              {ws.readOnlyMessage ?? t.ownerFailed}
            </Alert>
          )}
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={state === 'saving'}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t.ownerSave}
          </Button>
        </Stack>
      )}
    </Box>
  )
}
