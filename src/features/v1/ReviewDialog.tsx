import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { ShieldCheck } from 'lucide-react'
import type { Proposal } from './api'
import { useCopy } from './strings'
import { useWorkspace } from './workspaceContext'
import { formatPrice } from './format'

/** The only place a change is saved: the owner confirms the exact digest the server sealed. */
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
  const { api } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const snapshot = proposal?.snapshot
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
  return (
    <Dialog
      open={proposal !== null}
      onClose={() => {
        if (!busy) {
          setError('')
          onClose()
        }
      }}
      aria-labelledby="review-title"
    >
      <DialogTitle id="review-title">{t.reviewTitle}</DialogTitle>
      <DialogContent>
        {snapshot && (
          <Stack spacing={3}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Box sx={{ color: 'primary.main', pt: 0.5 }} aria-hidden="true">
                <ShieldCheck size={20} />
              </Box>
              <Typography variant="bodyMedium" color="text.secondary">
                {t.reviewNote}
              </Typography>
            </Stack>
            <Divider />
            {snapshot.kind === 'business' && snapshot.business ? (
              <Stack component="dl" spacing={2} sx={{ m: 0 }}>
                {(Object.keys(t.fields) as (keyof typeof t.fields)[])
                  .filter((key) => snapshot.business?.[key])
                  .map((key) => (
                    <Box key={key}>
                      <Typography component="dt" variant="labelMedium" color="text.secondary">
                        {t.fields[key]}
                      </Typography>
                      <Typography component="dd" variant="bodyLarge" sx={{ m: 0 }}>
                        {snapshot.business?.[key]}
                      </Typography>
                    </Box>
                  ))}
              </Stack>
            ) : (
              <Stack component="ul" spacing={2} sx={{ m: 0, p: 0, listStyle: 'none' }}>
                {snapshot.products.map((product) => (
                  <Stack
                    component="li"
                    key={product.name + product.unit}
                    direction="row"
                    sx={{ justifyContent: 'space-between', gap: 2 }}
                  >
                    <Box>
                      <Typography variant="bodyLarge">{product.name}</Typography>
                      <Typography variant="bodySmall" color="text.secondary">
                        {t.stock}: {product.stock ?? t.notProvided}
                      </Typography>
                    </Box>
                    <Typography variant="titleMedium" sx={{ whiteSpace: 'nowrap' }}>
                      {formatPrice(product.price)} / {product.unit}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button disabled={busy} onClick={onClose}>
          {t.cancel}
        </Button>
        <Button variant="contained" disabled={busy} onClick={() => void confirm()}>
          {t.confirmSave}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
