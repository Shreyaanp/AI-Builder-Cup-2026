import { useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, AlertTitle, Box, Button, Divider, Stack, Typography } from '@mui/material'
import { ShieldCheck } from 'lucide-react'
import type { Proposal } from './api'
import { ApiError } from './api'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { formatPrice, shopCurrency } from './format'
import { FactList } from './FactList'
import { Sheet } from './Sheet'
import { useLocale } from '../../state/hooks'
import { discoverCopy } from '../discover/strings'
import { useRewardCopy } from '../rewards/strings'
import { HoursList } from '../shop/Hours'
import { categoryLabel, useShopCopy } from '../shop/strings'
import { unitLabel } from '../shop/units'
import { CurrentLocationAction, LocationPin } from './CurrentLocation'
import { ClosedTodayNote } from './CoachActions'
import { useNextStepsCopy } from './nextStepsCopy'

/**
 * The only place a change is saved: the owner confirms the exact digest the server sealed.
 * Phones get an M3 bottom sheet; wider windows a dialog.
 */
export function ReviewDialog({
  proposal,
  onClose,
  onSaved,
}: {
  proposal: Proposal | null
  onClose: () => void
  onSaved: (businessId: string) => Promise<void>
}) {
  const t = useCopy()
  const rewards = useRewardCopy()
  const shopCopy = useShopCopy()
  const pinCopy = discoverCopy(useLocale())
  const next = useNextStepsCopy()
  const { api, businesses, review, reload, openEditor } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const snapshot = proposal?.snapshot
  // Honest visibility: shared shops show confirmed changes to customers immediately.
  const target = businesses.find((shop) => shop.id === snapshot?.business_id)
  const shared = Boolean(target?.public)
  // A new shop carries its currency in the proposal; edits use the saved shop's.
  const currency = snapshot?.business?.currency ?? shopCurrency(target)
  const open = proposal !== null
  // A reader that found nothing (e.g. a photo without connected AI) has nothing to confirm.
  const empty = Boolean(snapshot && !snapshot.business && snapshot.products.length === 0)
  async function findPin() {
    if (!proposal || busy) return
    setBusy(true)
    setError('')
    try {
      const pinned = await api<Proposal>('/proposals', {
        method: 'POST',
        body: JSON.stringify({
          ...proposal.snapshot,
          business_id: target ? proposal.snapshot.business_id : null,
          geocode_confirmed: true,
        }),
      })
      review({ ...pinned, photo_notes: proposal.photo_notes })
    } catch {
      setError(pinCopy.pinError)
    } finally {
      setBusy(false)
    }
  }
  function close() {
    if (busy) return
    setError('')
    onClose()
  }
  async function confirm() {
    if (!proposal || busy) return
    setBusy(true)
    setError('')
    try {
      const receipt = await api<{ business_id: string }>(`/proposals/${proposal.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ digest: proposal.digest }),
      })
      await onSaved(receipt.business_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.actionFailed)
      if (cause instanceof ApiError && cause.status === 409) await reload().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  const body: ReactNode = snapshot && (
    <Stack spacing={3}>
      {Boolean(proposal?.photo_notes?.length) && (
        <Alert severity="info">
          <AlertTitle>{t.photoReviewNotes}</AlertTitle>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {proposal?.photo_notes?.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </Box>
        </Alert>
      )}
      {empty && <Alert severity="info">{next.reviewEmpty}</Alert>}
      {Boolean(proposal?.import_flags?.length) && (
        <Alert severity="warning">
          {t.importReviewFlags}: {proposal?.import_flags?.map((flag) => flag.item).join(', ')}
        </Alert>
      )}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ color: 'primary.main', pt: 0.25, display: 'flex' }} aria-hidden="true">
          <ShieldCheck size={20} />
        </Box>
        <Typography variant="bodyMedium" color="text.secondary">
          {shared ? t.reviewNotePublic : t.reviewNote}
        </Typography>
      </Stack>
      {snapshot.business && (
        <>
          <CurrentLocationAction
            disabled={busy}
            onLocation={async (owner_location, signal) => {
              setBusy(true)
              try {
                const next = await api<Proposal>('/proposals', {
                  method: 'POST',
                  signal,
                  body: JSON.stringify({
                    ...snapshot,
                    business_id: target?.id ?? null,
                    owner_location,
                  }),
                })
                signal.throwIfAborted()
                review({ ...next, photo_notes: proposal?.photo_notes })
              } finally {
                setBusy(false)
              }
            }}
          />
          <LocationPin fields={snapshot.business} />
          {(snapshot.business.closed_on ?? '') !== (target?.fields.closed_on ?? '') && (
            <ClosedTodayNote
              closedOn={snapshot.business.closed_on ?? ''}
              before={target?.fields.closed_on}
            />
          )}
          {snapshot.business.description && (
            <Typography variant="bodyLarge">{snapshot.business.description}</Typography>
          )}
          <Divider />
          <Box>
            <Typography variant="labelMedium" color="text.secondary">
              {rewards.reward}
            </Typography>
            <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
              {snapshot.business.reward_text || '—'}
            </Typography>
            <Typography variant="labelMedium" color="text.secondary">
              {rewards.needed}
            </Typography>
            <Typography variant="bodyLarge">{snapshot.business.stamps_needed ?? 8}</Typography>
          </Box>
          <Stack component="dl" spacing={2} sx={{ m: 0 }}>
            {(Object.keys(t.fields) as (keyof typeof t.fields)[])
              .filter((key) => snapshot.business?.[key])
              .map((key) => (
                <Box key={key}>
                  <Typography component="dt" variant="labelMedium" color="text.secondary">
                    {t.fields[key]}
                  </Typography>
                  <Typography
                    component="dd"
                    variant="bodyLarge"
                    sx={{ m: 0, overflowWrap: 'anywhere' }}
                  >
                    {snapshot.business?.[key]}
                  </Typography>
                </Box>
              ))}
          </Stack>
          <FactList fields={snapshot.business} />
          <HoursList hours={snapshot.business.weekly_hours} />
          {snapshot.business.pin_label && (
            <Typography variant="bodyLarge">
              {pinCopy.pin}: {snapshot.business.pin_label}
              {snapshot.business.pin_demo && ` · ${pinCopy.demo}`}
            </Typography>
          )}
          {snapshot.business.location &&
            (!snapshot.business.pin_label || snapshot.business.pin_demo) && (
              <Stack spacing={2}>
                <Typography variant="bodyMedium" color="text.secondary">
                  {pinCopy.pinReason}
                </Typography>
                <Button variant="outlined" disabled={busy} onClick={() => void findPin()}>
                  {pinCopy.findPin}
                </Button>
              </Stack>
            )}
        </>
      )}
      {snapshot.products.length > 0 && (
        <>
          <Divider />
          <Typography component="h3" variant="titleSmall" color="text.secondary">
            {t.products}
          </Typography>
          <Stack component="ul" spacing={2} sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {snapshot.products.map((product) => (
              <Stack
                component="li"
                key={product.name + product.unit}
                direction="row"
                sx={{ justifyContent: 'space-between', gap: 2 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
                    {product.name}
                  </Typography>
                  {product.category && (
                    <Typography variant="bodySmall" color="text.secondary">
                      {shopCopy.category}: {categoryLabel(product.category, shopCopy)}
                    </Typography>
                  )}
                  {(product.stock != null || product.available === false) && (
                    <Typography variant="bodySmall" color="text.secondary">
                      {product.available === false ? t.soldOut : `${t.stock}: ${product.stock}`}
                    </Typography>
                  )}
                </Box>
                <Typography variant="titleMedium" sx={{ whiteSpace: 'nowrap' }}>
                  {formatPrice(product.price, currency)} / {unitLabel(product.unit, shopCopy)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  )
  const actions = empty ? (
    <>
      <Button onClick={close}>{t.close}</Button>
      <Button
        variant="contained"
        onClick={() => {
          close()
          openEditor({ kind: 'product', product: null })
        }}
      >
        {next.typeItems}
      </Button>
    </>
  ) : (
    <>
      <Button disabled={busy} onClick={close}>
        {t.cancel}
      </Button>
      <Button variant="contained" disabled={busy} onClick={() => void confirm()}>
        {t.confirmSave}
      </Button>
    </>
  )

  return (
    <Sheet
      open={open}
      onClose={close}
      // An open review is unsaved by definition: Back asks before throwing it away.
      dirty={!empty}
      titleId="review-title"
      title={t.reviewTitle}
      actions={actions}
      dismissInActions
    >
      {body}
    </Sheet>
  )
}
