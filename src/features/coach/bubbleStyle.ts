import type { MaterialRoles } from '../../design/theme'
import { shape } from '../../design/theme'

/** Shared by the coach and customer conversations. */
export function chatBubbleStyle(roles: MaterialRoles) {
  return {
    maxWidth: '85%',
    bgcolor: roles.surfaceContainerHigh,
    color: roles.onSurface,
    px: 3,
    py: 2,
    borderRadius: `${shape.xl}px ${shape.xs}px ${shape.xl}px ${shape.xl}px`,
  }
}
