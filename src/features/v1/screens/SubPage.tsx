import type { ReactNode } from 'react'
import { Box, Button } from '@mui/material'
import { ArrowLeft } from 'lucide-react'
import { useBackClose } from '../backStack'
import { useTabsCopy } from '../tabsCopy'
import { useWorkspace } from '../workspaceContext'
import type { Destination } from '../workspaceContext'

/**
 * A page opened from a tab card (Google from Grow, Privacy from You). The tab stays selected,
 * a back link leads to it, and the phone's Back returns there instead of leaving the app.
 */
export function SubPage({
  parent,
  label,
  children,
}: {
  parent: Destination
  label: string
  children: ReactNode
}) {
  const tabs = useTabsCopy()
  const ws = useWorkspace()
  useBackClose(true, () => ws.go(parent))
  return (
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <Button
        startIcon={<ArrowLeft size={18} />}
        onClick={() => ws.go(parent)}
        aria-label={tabs.backTo(label)}
        sx={{ mt: 1, ml: -1, minHeight: 48 }}
      >
        {label}
      </Button>
      {children}
    </Box>
  )
}
