import { useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Box, Button, Divider, Stack, Typography } from '@mui/material'
import { ShieldCheck } from 'lucide-react'
import type { Proposal } from './api'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { formatPrice, shopCurrency } from './format'
import { FactList } from './FactList'
import { Sheet } from './Sheet'
import { useLocale } from '../../state/hooks'
import { discoverCopy } from '../discover/strings'

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
  const pinCopy = discoverCopy(useLocale())
  const { api, businesses, review } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const snapshot = proposal?.snapshot
  // Honest visibility: shared shops show confirmed changes to customers immediately.
  const target = businesses.find((shop) => shop.id === snapshot?.business_id)
  const shared = Boolean(target?.public)
  // A new shop carries its currency in the proposal; edits use the saved shop's.
  const currency = snapshot?.business?.currency ?? shopCurrency(target)
  const open = proposal !== null
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
      review(pinned)
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
    } finally {
      setBusy(false)
    }
  }

  const body: ReactNode = snapshot && (
    <Stack spacing={3}>
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
          <Divider />
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
                  {(product.stock != null || product.available === false) && (
                    <Typography variant="bodySmall" color="text.secondary">
                      {product.available === false ? t.soldOut : `${t.stock}: ${product.stock}`}
                    </Typography>
                  )}
                </Box>
                <Typography variant="titleMedium" sx={{ whiteSpace: 'nowrap' }}>
                  {formatPrice(product.price, currency)} / {product.unit}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  )
  const actions = (
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
      titleId="review-title"
      title={t.reviewTitle}
      actions={actions}
    >
      {body}
    </Sheet>
  )
}
