import { Tooltip, useMediaQuery, type TooltipProps } from '@mui/material'

/**
 * A tooltip for mice only. On a touch phone there is no hover, so a tap used to leave it stuck
 * open over the page (#262); the button's aria-label still names it for screen readers.
 */
export function HoverTip(props: TooltipProps) {
  const touch = useMediaQuery('(hover: none)')
  if (touch) return props.children
  return <Tooltip {...props} />
}
