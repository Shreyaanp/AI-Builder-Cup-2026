import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { useMediaQuery, useTheme } from '@mui/material'
import { PendingDialog } from '../features/v1/PendingDialog'
import { useCopy } from '../features/v1/strings'

/** Stands in for the sheet while its code loads, so a tap answers at once and Back closes it. */
function Opening({ onClose }: { onClose: () => void }) {
  const t = useCopy()
  const compact = useMediaQuery(useTheme().breakpoints.down('sm'))
  return <PendingDialog title={t.opening} fullScreen={compact} onClose={onClose} />
}

/**
 * Mounts a deferred sheet from the first time it opens and keeps it mounted, so its code is not
 * on the first screen (OB-165) and its closing animation still plays. While the code loads, an
 * open sheet shows a placeholder that Back or Escape closes (OB-185), so a sheet never appears
 * late on top of a screen the owner has moved on to.
 */
export function OnceOpened({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  return opened ? (
    <Suspense fallback={open ? <Opening onClose={onClose} /> : null}>{children}</Suspense>
  ) : null
}
