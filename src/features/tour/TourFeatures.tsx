import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { FirstCustomers } from '../v1/FirstCustomers'
import { ImportPanel } from '../v1/ImportMenu'
import { useImport } from '../v1/useImport'
import { useWorkspace } from '../v1/workspaceContext'
import { NewShopReady } from '../v1/NewShopStage'

/** A full screen behind the tour card; read only (inert), so nothing is tapped by accident. */
export function TourPanel({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        overflowY: 'auto',
        p: 2,
        pt: 'max(24px, env(safe-area-inset-top))',
        // The tour card sits over the bottom of the screen on a phone.
        pb: 'calc(280px + env(safe-area-inset-bottom))',
      }}
    >
      {/* One solid card for the preview, so the dimmed page around it never shows through it. */}
      <Box
        data-tour="feature"
        inert
        sx={{
          maxWidth: 680,
          mx: 'auto',
          p: 1.5,
          bgcolor: 'background.default',
          borderRadius: 4,
          boxShadow: 6,
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

/** Read-only previews use the selected seeded shop; no publishing or importing during a tour. */
export function TourFeature({ index }: { index: number }) {
  const ws = useWorkspace()
  const importer = useImport({ onSales: () => undefined })
  const link = ws.shareUrl ? new URL(ws.shareUrl, location.origin).href : null
  return (
    <TourPanel>
      {index === 0 && <ImportPanel importer={importer} onTypeItems={() => undefined} />}
      {index === 1 && link && <FirstCustomers url={link} name={ws.active?.fields.name ?? ''} />}
      {index === 2 && <NewShopReady preview />}
    </TourPanel>
  )
}
