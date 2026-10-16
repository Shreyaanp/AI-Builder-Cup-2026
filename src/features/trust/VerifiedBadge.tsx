import { useId, useState } from 'react'
import { Box, ButtonBase, Typography, useTheme } from '@mui/material'
import { BadgeCheck } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { formatDate } from '../v1/format'
import { fill, useTrustCopy } from './copy'

/**
 * "Verified owner" on the customer page: shown only after the owner's optional live face check
 * passed. Tapping explains exactly what it means and what it does not.
 */
export function VerifiedBadge({ checked }: { checked?: number | null }) {
  const c = useTrustCopy()
  const locale = useLocale()
  const roles = useTheme().material
  const [open, setOpen] = useState(false)
  const id = useId()
  const date = checked ? formatDate(checked, locale) : ''
  return (
    <Box sx={{ my: 0.5 }}>
      <ButtonBase
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          minHeight: 32,
          px: 1.25,
          borderRadius: 999,
          bgcolor: roles.primaryContainer,
          color: roles.onPrimaryContainer,
          '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: 2 },
        }}
      >
        <BadgeCheck size={16} aria-hidden="true" />
        <Typography component="span" variant="labelLarge" sx={{ fontWeight: 600 }}>
          {c.badge}
        </Typography>
      </ButtonBase>
      {open && (
        <Typography
          id={id}
          variant="bodySmall"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.75, maxWidth: 480 }}
        >
          {fill(c.badgeInfo, { date })}
        </Typography>
      )}
    </Box>
  )
}
