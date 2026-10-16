import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { BadgeCheck, Info, ScanFace, ShieldAlert, UserSearch } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { useBackClose } from '../v1/backStack'
import { formatDate } from '../v1/format'
import { useWorkspace } from '../v1/workspaceContext'
import { shape } from '../../design/theme'
import { fill, useTrustCopy } from './copy'
import { announceTrustChange, useTrust, type Notice } from './useTrust'
import { ReviewQueue } from './ReviewQueue'

/**
 * "Verify it's you": the optional face check's status, start/again and delete. `compact` is the
 * one-card version placed in the publishing flow; the full card in Privacy also lists the
 * owner's open notices and, for reviewers, the review queue.
 */
export function TrustCard({ compact = false }: { compact?: boolean }) {
  const c = useTrustCopy()
  const locale = useLocale()
  const ws = useWorkspace()
  const roles = useTheme().material
  const { trust, reload } = useTrust(ws.api)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  useBackClose(confirming, () => !busy && setConfirming(false))
  const face = trust?.face ?? 'not_started'
  const verified = face === 'verified'

  async function remove() {
    setBusy(true)
    try {
      await ws.api('/face/template', { method: 'DELETE' })
      announceTrustChange()
      ws.notify(c.deleted)
      setConfirming(false)
    } catch {
      ws.notify(c.reasons.worker_unavailable!)
    } finally {
      setBusy(false)
    }
  }

  const body =
    face === 'verified' && trust?.checked
      ? fill(c.verifiedOn, { date: formatDate(trust.checked, locale) })
      : face === 'in_review'
        ? c.inReview
        : face === 'not_verified'
          ? c.notVerified
          : c.pitch
  const icon =
    face === 'verified' ? (
      <BadgeCheck size={22} />
    ) : face === 'in_review' ? (
      <UserSearch size={22} />
    ) : face === 'not_verified' ? (
      <ShieldAlert size={22} />
    ) : (
      <ScanFace size={22} />
    )
  const listings = (trust?.notices ?? []).filter((notice) => notice.kind === 'listing')

  return (
    <>
      <Box
        component="section"
        aria-labelledby="trust-title"
        sx={{
          bgcolor: verified ? roles.primaryContainer : roles.surfaceContainerLow,
          color: verified ? roles.onPrimaryContainer : roles.onSurface,
          borderRadius: `${compact ? shape.lgIncreased : shape.lg}px`,
          p: 3,
          transition: 'background-color 300ms linear',
        }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Box
            aria-hidden="true"
            sx={{ display: 'flex', color: verified ? 'inherit' : roles.primary }}
          >
            {icon}
          </Box>
          <Typography
            id="trust-title"
            component={compact ? 'h3' : 'h2'}
            variant="titleMedium"
            sx={{ flex: 1 }}
          >
            {c.title}
          </Typography>
          <Chip
            size="small"
            label={face === 'not_started' ? c.optional : c.status[face]}
            sx={{
              bgcolor: verified ? roles.primary : roles.secondaryContainer,
              color: verified ? roles.onPrimary : roles.onSecondaryContainer,
              fontWeight: 600,
            }}
          />
        </Stack>
        <Typography variant="bodyMedium" sx={{ color: verified ? 'inherit' : 'text.secondary' }}>
          {body}
        </Typography>
        <Stack direction="row" sx={{ mt: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant={face === 'not_started' ? 'contained' : 'outlined'}
            color={verified ? 'inherit' : 'primary'}
            disabled={!ws.active}
            startIcon={<ScanFace size={18} />}
            onClick={() => ws.setFaceOpen(true)}
          >
            {face === 'not_started' ? c.start : c.again}
          </Button>
          {face !== 'not_started' && (
            <Button color={verified ? 'inherit' : 'error'} onClick={() => setConfirming(true)}>
              {c.delete}
            </Button>
          )}
        </Stack>
        {!ws.active && (
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {c.needsShop}
          </Typography>
        )}
      </Box>

      {!compact && listings.map((notice) => <ListingNotice key={notice.id} notice={notice} />)}
      {!compact && trust?.reviewer && <ReviewQueue queue={trust.queue ?? []} onChange={reload} />}

      <Dialog
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        aria-labelledby="trust-delete-title"
      >
        <DialogTitle id="trust-delete-title">{c.deleteTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText>{c.deleteBody}</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button disabled={busy} onClick={() => setConfirming(false)}>
            {c.cancel}
          </Button>
          <Button variant="contained" color="error" disabled={busy} onClick={() => void remove()}>
            {c.deleteConfirm}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

/** A listing a person will double-check: calm, specific, and what the owner can do. */
function ListingNotice({ notice }: { notice: Notice }) {
  const c = useTrustCopy()
  const roles = useTheme().material
  return (
    <Box
      component="section"
      aria-label={fill(c.listingTitle, { shop: notice.shop ?? '' })}
      sx={{
        bgcolor: roles.secondaryContainer,
        color: roles.onSecondaryContainer,
        borderRadius: `${shape.lg}px`,
        p: 3,
      }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Box aria-hidden="true" sx={{ display: 'flex', mt: 0.25 }}>
          <Info size={22} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" variant="titleMedium" sx={{ overflowWrap: 'anywhere' }}>
            {fill(c.listingTitle, { shop: notice.shop ?? '' })}
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, display: 'grid', gap: 0.5 }}>
            {(notice.reasons ?? []).map((reason) => (
              <Typography
                component="li"
                variant="bodyMedium"
                key={reason.rule + reason.detail}
                sx={{ overflowWrap: 'anywhere' }}
              >
                {fill(c.rules[reason.rule] ?? c.rules.other!, { detail: reason.detail })}
              </Typography>
            ))}
          </Box>
          <Typography variant="bodySmall" sx={{ mt: 1.5, display: 'block' }}>
            {c.listingBody}
          </Typography>
        </Box>
      </Stack>
    </Box>
  )
}
