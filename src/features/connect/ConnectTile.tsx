import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { ShopRow } from '../v1/ShopRow'
import { useWorkspace } from '../v1/workspaceContext'
import { ConnectSheet } from './ConnectSheet'
import { useConnectCopy } from './strings'
import type { SavedMappingSummary } from './types'

/** Shop → More: "Link your billing app", with the last linked app's name once there is one. */
export function ConnectRow() {
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

  return (
    <>
      <ShopRow
        icon={<Layers size={20} />}
        label={t.connectTitle}
        value={savedMappings[0]?.source_label}
        onClick={() => setOpen(true)}
      />
      <ConnectSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
