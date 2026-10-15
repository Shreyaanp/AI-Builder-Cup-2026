import { useEffect, useState } from 'react'
import { Typography } from '@mui/material'
import { Layers } from 'lucide-react'
import { Tile } from '../v1/ShopTiles'
import { useWorkspace } from '../v1/workspaceContext'
import { ConnectSheet } from './ConnectSheet'
import { useConnectCopy } from './strings'
import type { SavedMappingSummary } from './types'

export function ConnectTile() {
  const t = useConnectCopy()
  const ws = useWorkspace()
  const shop = ws.active
  const [open, setOpen] = useState(false)
  const [savedMappings, setSavedMappings] = useState<SavedMappingSummary[]>([])

  useEffect(() => {
    if (!shop) return
    let active = true
    ws.api<SavedMappingSummary[]>(`/businesses/${encodeURIComponent(shop.id)}/connect/mappings`)
      .then((items) => {
        if (active) setSavedMappings(items)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [shop, ws])

  const latest = savedMappings[0]
  const tileValue = latest ? `${latest.source_label}` : 'POS / ERP'
  const supporting = latest
    ? latest.last_synced
      ? t.lastSynced(new Date(latest.last_synced * 1000).toLocaleDateString())
      : t.notSyncedYet
    : t.connectSubtitle

  return (
    <>
      <Tile
        icon={<Layers size={20} />}
        label={t.connectTitle}
        value={tileValue}
        onClick={() => setOpen(true)}
      >
        <Typography
          component="span"
          variant="bodySmall"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.5 }}
        >
          {supporting}
        </Typography>
      </Tile>

      <ConnectSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
