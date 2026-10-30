import type { ReactNode } from 'react'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { shape } from '../../design/theme'
import { useUndoableSend } from './ioData'
import { useOrderChangeCopy } from './orderChangeCopy'

/**
 * A change to an order that already went out (OB-225): the owner sees what the supplier gets,
 * confirms, and can still undo for a few seconds before anything is sent.
 */
export function ConfirmUndo({
  ask,
  children,
  confirm,
  counting,
  danger = false,
  disabled = false,
  onKeep,
  onRun,
}: {
  ask: ReactNode
  children?: ReactNode
  confirm: string
  counting: (seconds: number) => string
  danger?: boolean
  disabled?: boolean
  onKeep: () => void
  onRun: () => Promise<unknown>
}) {
  const c = useOrderChangeCopy()
  const roles = useTheme().material
  const timer = useUndoableSend()
  if (timer.left !== null)
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 2 }}>
        <Typography role="status" variant="bodyLarge" sx={{ flex: 1 }}>
          {counting(timer.left)}
        </Typography>
        <Button variant="contained" onClick={timer.undo} sx={{ minHeight: 48 }}>
          {c.undo}
        </Button>
      </Stack>
    )
  return (
    <Box
      sx={{
        p: 4,
        display: 'grid',
        gap: 3,
        borderRadius: `${shape.md}px`,
        border: `1px solid ${roles.outlineVariant}`,
        bgcolor: roles.surfaceContainerLow,
      }}
    >
      <Typography variant="bodyLarge" sx={{ overflowWrap: 'anywhere' }}>
        {ask}
      </Typography>
      {children}
      <Stack
        direction="row"
        sx={{ justifyContent: 'flex-end', flexWrap: 'wrap', columnGap: 2, rowGap: 2 }}
      >
        <Button onClick={onKeep} sx={{ minHeight: 48 }}>
          {c.keepOrder}
        </Button>
        <Button
          variant={danger ? 'outlined' : 'contained'}
          color={danger ? 'error' : 'primary'}
          disabled={disabled}
          onClick={() => timer.start(onRun)}
          sx={{ minHeight: 48 }}
        >
          {confirm}
        </Button>
      </Stack>
    </Box>
  )
}
