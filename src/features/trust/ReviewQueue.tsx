import { useState } from 'react'
import { Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material'
import { Gavel, RefreshCw } from 'lucide-react'
import { useWorkspace } from '../v1/workspaceContext'
import { shape } from '../../design/theme'
import { fill, useTrustCopy } from './copy'
import { announceTrustChange, type Review } from './useTrust'

/** Reviewers only: possible duplicate owners and listing flags. Deciding never changes a shop. */
export function ReviewQueue({ queue, onChange }: { queue: Review[]; onChange: () => void }) {
  const c = useTrustCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const [busy, setBusy] = useState<string | null>(null)

  async function scan() {
    setBusy('scan')
    try {
      const { flagged } = await ws.api<{ flagged: number }>('/trust/scan', { method: 'POST' })
      ws.notify(fill(c.scanned, { n: flagged }))
      onChange()
    } catch {
      ws.notify(c.reasons.worker_unavailable!)
    } finally {
      setBusy(null)
    }
  }

  async function decide(id: string, decision: 'cleared' | 'upheld') {
    setBusy(id)
    try {
      await ws.api(`/trust/reviews/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      })
      announceTrustChange()
    } catch {
      ws.notify(c.reasons.worker_unavailable!)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Box
      component="section"
      aria-labelledby="queue-title"
      sx={{ bgcolor: roles.surfaceContainerLow, borderRadius: `${shape.lg}px`, p: 3 }}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
        <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
          <Gavel size={22} />
        </Box>
        <Typography id="queue-title" component="h2" variant="titleMedium" sx={{ flex: 1 }}>
          {c.queueTitle}
        </Typography>
      </Stack>
      <Typography variant="bodyMedium" color="text.secondary">
        {c.queueNote}
      </Typography>
      <Button
        variant="outlined"
        startIcon={<RefreshCw size={18} />}
        disabled={busy === 'scan'}
        onClick={() => void scan()}
        sx={{ mt: 2 }}
      >
        {c.scan}
      </Button>
      {queue.length === 0 ? (
        <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 2 }}>
          {c.queueEmpty}
        </Typography>
      ) : (
        <Box
          component="ul"
          sx={{ listStyle: 'none', m: 0, mt: 2, p: 0, display: 'grid', gap: 1.5 }}
        >
          {queue.map((item) => (
            <Box
              component="li"
              key={item.id}
              aria-label={item.kind === 'duplicate_owner' ? c.duplicate : (item.shop ?? c.listing)}
              sx={{
                p: 2.5,
                borderRadius: `${shape.md}px`,
                // Decided rows say so in their chip; dimming them failed text contrast.
                bgcolor:
                  item.status === 'open' ? roles.surfaceContainer : roles.surfaceContainerLowest,
              }}
            >
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
                <Typography variant="titleSmall" component="h3" sx={{ flex: 1, minWidth: 0 }}>
                  {item.kind === 'duplicate_owner' ? c.duplicate : `${c.listing}: ${item.shop}`}
                </Typography>
                <Chip size="small" label={c.decided[item.status] ?? item.status} />
              </Stack>
              {item.kind === 'duplicate_owner' ? (
                <Stack spacing={0.5}>
                  <Typography variant="bodyMedium">
                    {fill(c.similarity, { n: (item.similarity ?? 0).toFixed(2) })}
                  </Typography>
                  {[c.newer, c.earlier].map((label, index) => (
                    <Typography
                      key={label}
                      variant="bodyMedium"
                      color="text.secondary"
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {label}: {(item.shops?.[index] ?? []).join(', ') || '—'}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
                  {(item.reasons ?? []).map((reason, index) => (
                    <Typography
                      component="li"
                      variant="bodyMedium"
                      // Two different shops can share a name, so rule and detail are not unique.
                      key={`${index}-${reason.rule}`}
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {reason.detail}{' '}
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        · {c.source[reason.source] ?? reason.source}
                      </Box>
                    </Typography>
                  ))}
                </Box>
              )}
              {item.status === 'open' && (
                <Stack direction="row" sx={{ gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={busy === item.id}
                    onClick={() => void decide(item.id, 'cleared')}
                  >
                    {c.clear}
                  </Button>
                  <Button
                    size="small"
                    disabled={busy === item.id}
                    onClick={() => void decide(item.id, 'upheld')}
                  >
                    {c.uphold}
                  </Button>
                </Stack>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
