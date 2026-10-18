import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import { useIoCopy } from '../supply/ioCopy'
import { useSupply } from '../supply/supplyData'
import { PurchaseOrderCard } from '../supply/PurchaseOrderCard'
import { TodaySupplyNeeds } from '../supply/SupplyEntry'
import { TodaySupply } from '../supply/TodaySupply'
import { FirstCustomers } from '../v1/FirstCustomers'
import { ImportPanel } from '../v1/ImportMenu'
import { useImport } from '../v1/useImport'
import { useWorkspace } from '../v1/workspaceContext'
import { NewShopReady } from '../v1/NewShopStage'

/** Read-only previews use the selected seeded shop; no publishing or importing during a tour. */
export function TourFeature({ index }: { index: number }) {
  const ws = useWorkspace()
  const c = useIoCopy()
  const { data } = useSupply(index === 1 || index === 2)
  const importer = useImport({ onSales: () => undefined })
  const order = data?.orders.find((o) => o.documents.length > 0)
  const link = ws.shareUrl ? new URL(ws.shareUrl, location.origin).href : null
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 1400,
        bgcolor: 'background.default',
        overflowY: 'auto',
        p: 3,
        pt: 'max(24px, env(safe-area-inset-top))',
      }}
    >
      <Box data-tour="feature" inert sx={{ maxWidth: 680, mx: 'auto' }}>
        {index === 0 && (
          <>
            <TodaySupply />
            <TodaySupplyNeeds />
          </>
        )}
        {(index === 1 || index === 2) &&
          (order ? (
            <Stack spacing={3}>
              <Typography variant="headlineSmall">{order.supplier.name}</Typography>
              <PurchaseOrderCard
                order={order}
                onChange={() => undefined}
                preview={index === 1 ? 'timeline' : 'sap'}
              />
            </Stack>
          ) : (
            <Box role="status">{data ? c.empty.coming : <CircularProgress />}</Box>
          ))}
        {index === 3 && <ImportPanel importer={importer} onTypeItems={() => undefined} />}
        {index === 4 && link && <FirstCustomers url={link} name={ws.active?.fields.name ?? ''} />}
        {index === 5 && <NewShopReady preview />}
      </Box>
    </Box>
  )
}
