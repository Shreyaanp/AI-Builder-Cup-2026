import { useEffect, useState } from 'react'
import { Alert, Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material'
import { Plus, Radar as RadarIcon, ShieldCheck } from 'lucide-react'
import type { components } from '../../api/generated'
import { shape } from '../../design/theme'
import { Sheet } from '../v1/Sheet'
import { Supporting, Tile } from '../v1/ShopTiles'
import { useWorkspace } from '../v1/workspaceContext'
import { fill, useOwnerCopy } from './copy'

type Radar = components['schemas']['Radar']

function useRadar(bid: string, active: boolean) {
  const { api } = useWorkspace()
  const [radar, setRadar] = useState<Radar | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!active) return
    const abort = new AbortController()
    api<Radar>(`/businesses/${encodeURIComponent(bid)}/radar`, { signal: abort.signal })
      .then((found) => {
        setRadar(found)
        setFailed(false)
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true)
      })
    return () => abort.abort()
  }, [api, bid, active, attempt])
  return { radar, failed, retry: () => setAttempt((n) => n + 1) }
}

/** My shop's "Asked nearby" tile: how many unmet-demand ideas pass the privacy threshold. */
export function RadarTile() {
  const t = useOwnerCopy()
  const theme = useTheme()
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  const { radar } = useRadar(ws.active!.id, true)
  const count = radar?.opportunities.length ?? 0
  return (
    <>
      <Tile
        icon={<RadarIcon size={20} color={theme.chalk.lilac.main} />}
        label={t.radar}
        value={radar ? (count ? fill(t.ideas, { n: count }) : t.noIdeas) : '–'}
        onClick={() => setOpen(true)}
      >
        {count > 0 && (
          <Supporting>
            {radar!.opportunities
              .slice(0, 2)
              .map((o) => o.label)
              .join(' · ')}
          </Supporting>
        )}
      </Tile>
      <RadarSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * What people nearby asked Chalkboard for that no shop here lists. Counts come only as bands
 * (5–9, 10–19, 20+) once 5 different people asked; demo activity is labelled on every row.
 */
export function RadarSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useOwnerCopy()
  const theme = useTheme()
  const roles = theme.material
  const ws = useWorkspace()
  const { radar, failed, retry } = useRadar(ws.active!.id, open)
  const km = radar ? new Intl.NumberFormat(undefined).format(radar.radius / 1000) : ''
  return (
    <Sheet open={open} onClose={onClose} titleId="radar-sheet-title" title={t.radar}>
      {failed && !radar ? (
        <Alert severity="error" action={<Button onClick={retry}>{t.retry}</Button>}>
          {t.loadFailed}
        </Alert>
      ) : !radar ? null : (
        <Stack spacing={4}>
          <Typography variant="bodyMedium" color="text.secondary">
            {radar.approximate || !radar.area_label
              ? fill(t.radarScopeApprox, { days: radar.days, km })
              : fill(t.radarScope, { days: radar.days, km, area: radar.area_label })}
          </Typography>
          {radar.opportunities.length === 0 ? (
            <Typography variant="bodyLarge">{t.radarEmpty}</Typography>
          ) : (
            <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {radar.opportunities.map((o) => (
                <Box
                  component="li"
                  key={o.key}
                  sx={{ p: 3, borderRadius: `${shape.md}px`, bgcolor: roles.surfaceContainer }}
                >
                  <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography
                      component="h3"
                      variant="titleMedium"
                      sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
                    >
                      {o.label}
                    </Typography>
                    {o.demo && <Chip size="small" label={t.demoActivity} />}
                  </Stack>
                  <Typography variant="bodyMedium" sx={{ mt: 0.5 }}>
                    {fill(t.band, { band: o.band })} ·{' '}
                    {o.google_count ? fill(t.google, { n: o.google_count }) : t.unmet}
                  </Typography>
                  <Stack
                    direction="row"
                    sx={{ mt: 1.5, gap: 2, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <Chip
                      size="small"
                      variant="outlined"
                      label={o.fit >= 0.6 ? t.fits : t.other}
                      sx={
                        o.fit >= 0.6
                          ? {
                              borderColor: theme.chalk.lilac.main,
                              color: roles.onSurface,
                            }
                          : undefined
                      }
                    />
                    <Box sx={{ flex: 1 }} />
                    <Button
                      size="small"
                      startIcon={<Plus size={16} />}
                      onClick={() => {
                        onClose()
                        ws.startCoachDraft(fill(t.addDraft, { item: o.label }))
                      }}
                    >
                      {t.addToMenu}
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
          <Stack direction="row" sx={{ gap: 2, alignItems: 'flex-start' }}>
            <ShieldCheck size={18} aria-hidden="true" color={roles.onSurfaceVariant} />
            <Typography variant="bodySmall" color="text.secondary">
              {t.radarPrivacy}
            </Typography>
          </Stack>
        </Stack>
      )}
    </Sheet>
  )
}
