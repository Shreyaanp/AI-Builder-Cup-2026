import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Mounts a deferred sheet from the first time it opens and keeps it mounted, so its code is not
 * on the first screen (OB-165) and its closing animation still plays.
 */
export function OnceOpened({ open, children }: { open: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  return opened ? <Suspense fallback={null}>{children}</Suspense> : null
}
