import { useEffect } from 'react'
import { Button, Snackbar, useTheme } from '@mui/material'
import { useWorkspace } from '../v1/workspaceContext'
import { useStockCopy } from './stockCopy'

/**
 * "Bun maska: 5 left · Undo" after a stock tap (OB-310). Inside an open sheet it shows there, so
 * Undo stays reachable by keyboard and screen reader; the app's own copy waits until it closes.
 */
export function StockNote({ inSheet = false }: { inSheet?: boolean }) {
  const ws = useWorkspace()
  const copy = useStockCopy()
  const roles = useTheme().material
  const { hostStockNote } = ws
  useEffect(() => (inSheet ? hostStockNote() : undefined), [inSheet, hostStockNote])
  const note = ws.stockNote
  if (!inSheet && ws.stockNoteHosted) return null
  return (
    <Snackbar
      open={note !== null}
      message={note?.message ?? ''}
      autoHideDuration={6000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') note?.close()
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      // In a sheet it sits over the sheet's own action row, never over the next item's − / +
      // (OB-310); elsewhere above the app's bottom bar.
      sx={{
        bottom: {
          xs: `calc(${inSheet ? 8 : 96}px + env(safe-area-inset-bottom))`,
          sm: 24,
        },
      }}
      action={
        <Button
          color="inherit"
          onClick={() => note?.undo()}
          sx={{ color: roles.inversePrimary, minHeight: 48 }}
        >
          {copy.undo}
        </Button>
      }
    />
  )
}
