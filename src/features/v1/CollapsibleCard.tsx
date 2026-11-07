import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { ChevronDown } from 'lucide-react'
import { fieldFade, motion, shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { summaryCopy, summaryText, type CardSummary } from './cardSummary'

/**
 * OB-249: one chat card. Only the newest card shows in full; earlier ones shrink to one line
 * (icon · what · status) that opens them again. Display only: the card stays mounted while
 * folded, so typed amounts, choices and drafts survive, and nothing is fetched again. A card that
 * still needs the owner keeps its action (`action`) on the line.
 */
export function CollapsibleCard({
  open,
  newest,
  summary,
  icon,
  action,
  onToggle,
  children,
}: {
  open: boolean
  /** The newest card shows without a line above it while it is open. */
  newest: boolean
  summary: CardSummary
  icon: ReactNode
  /** The card's primary action, shown on the folded line (same accessible name as in the card). */
  action?: ReactNode
  onToggle: () => void
  children: ReactNode
}) {
  const roles = useTheme().material
  const c = summaryCopy(useLocale())
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const panel = useId()
  const text = summaryText(summary)
  const line = !open || !newest
  const toggle = useRef<HTMLButtonElement>(null)
  const actionFocus = useRef(false)
  const showAction = !open && Boolean(action) && line
  // The line's action unmounts once it is done (the card no longer needs the owner): keep keyboard
  // and screen-reader focus on this line instead of dropping it to the page top.
  useEffect(() => {
    if (showAction || !actionFocus.current) return
    actionFocus.current = false
    const active = document.activeElement
    if (!active || active === document.body) toggle.current?.focus()
  }, [showAction])
  return (
    <Box component="li" sx={{ minWidth: 0 }}>
      {line && (
        <Stack
          data-card-line
          direction="row"
          spacing={2}
          sx={{ pl: { xs: 0, sm: 10 }, mb: open ? 2 : 0, alignItems: 'center', ...fieldFade }}
        >
          <ButtonBase
            ref={toggle}
            aria-expanded={open}
            aria-controls={panel}
            aria-label={`${text}. ${open ? c.hide : c.show}`}
            onClick={onToggle}
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              px: 3,
              gap: 2,
              justifyContent: 'flex-start',
              textAlign: 'left',
              borderRadius: `${shape.lg}px`,
              bgcolor: roles.surfaceContainerLow,
              color: roles.onSurface,
              border: `1px solid ${summary.needsYou ? roles.primary : roles.outlineVariant}`,
              '&.Mui-focusVisible': { outline: `2px solid ${roles.primary}`, outlineOffset: 2 },
            }}
          >
            <Box aria-hidden="true" sx={{ display: 'flex', color: roles.primary, flexShrink: 0 }}>
              {icon}
            </Box>
            {/* What on top, its status under it: the status never truncates beside an action. */}
            <Box component="span" sx={{ flex: 1, minWidth: 0, py: 1 }}>
              <Typography component="span" variant="bodyMedium" noWrap sx={{ display: 'block' }}>
                {summary.parts.filter(Boolean).join(' · ')}
              </Typography>
              {summary.status && (
                <Typography
                  component="span"
                  variant="labelMedium"
                  noWrap
                  sx={{
                    display: 'block',
                    color: summary.needsYou ? roles.primary : 'text.secondary',
                    fontWeight: summary.needsYou ? 600 : undefined,
                  }}
                >
                  {summary.status}
                </Typography>
              )}
            </Box>
            <Box
              aria-hidden="true"
              sx={{
                display: 'flex',
                flexShrink: 0,
                color: roles.onSurfaceVariant,
                transform: open ? 'rotate(180deg)' : 'none',
                transition: reducedMotion
                  ? 'none'
                  : `transform ${motion.duration.short}ms ${motion.easing.standard}`,
              }}
            >
              <ChevronDown size={18} />
            </Box>
          </ButtonBase>
          {!open && action && (
            <Box
              sx={{ flexShrink: 0 }}
              onFocus={() => {
                actionFocus.current = true
              }}
              onBlur={(event) => {
                if (event.relatedTarget) actionFocus.current = false
              }}
            >
              {action}
            </Box>
          )}
        </Stack>
      )}
      <Collapse in={open} id={panel} timeout={reducedMotion ? 0 : motion.duration.short}>
        {children}
      </Collapse>
    </Box>
  )
}

/** A folded card's primary action ("Send", "Confirm"): 48 px, named as in the open card. */
export function LineAction({
  label,
  name,
  icon,
  disabled,
  onRun,
}: {
  label: string
  /** The accessible name when it says more than the label ("Send to Sri Lakshmi"). */
  name?: string
  icon?: ReactNode
  disabled?: boolean
  onRun: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="contained"
      disabled={busy || disabled}
      aria-label={name}
      startIcon={busy ? <CircularProgress size={16} color="inherit" /> : icon}
      onClick={() => {
        setBusy(true)
        void onRun().finally(() => setBusy(false))
      }}
      sx={{ minHeight: 48, whiteSpace: 'nowrap' }}
    >
      {label}
    </Button>
  )
}
