import { useState } from 'react'
import { Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material'
import { ArrowUpRight, Send } from 'lucide-react'
import { RichText } from '../../design/RichText'
import { enterRise, shape } from '../../design/theme'
import { useLocale } from '../../state/hooks'
import { NEEDS_TAP, type CoachAction } from './coachAction'

/**
 * Coach action copy. Kept in its own module so locales added elsewhere fall back to English
 * instead of breaking the build; add a locale below.
 */
const en = {
  open: (label: string) => `Open ${label}`,
  customerAsked: 'Customer asked',
  yourReply: 'Your reply',
  send: 'Send',
  sent: 'Sent',
  notNow: 'Not now',
  hint: 'Nothing is sent until you tap Send.',
  failed: 'Could not send. Try again.',
  closedToday: (day: string) => `Closed for the day (${day}). Normal hours return tomorrow.`,
  openToday: 'Open again today, by your usual hours.',
}
type Copy = typeof en
const COPY: Record<string, Copy> = { en }

function useActionCopy(): Copy {
  const locale = useLocale()
  return COPY[locale.split('-')[0] ?? 'en'] ?? en
}

/** Opens (or re-opens) the screen the coach pointed to. */
export function ActionChip({ action, onOpen }: { action: CoachAction; onOpen: () => void }) {
  const c = useActionCopy()
  return (
    <Box component="li" sx={{ pl: { xs: 0, sm: 10 }, ...enterRise }}>
      <Chip
        icon={<ArrowUpRight size={18} />}
        label={NEEDS_TAP.has(action.target) ? action.label : c.open(action.label)}
        variant="outlined"
        onClick={onOpen}
        sx={{ minHeight: 48 }}
      />
    </Box>
  )
}

/** After a coach change is saved: one tap to that item in the menu (no duplicate to hunt for). */
export function MenuLinkChip({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <Box component="li" sx={{ pl: { xs: 0, sm: 10 }, ...enterRise }}>
      <Chip
        icon={<ArrowUpRight size={18} />}
        label={label}
        variant="outlined"
        onClick={onOpen}
        sx={{ minHeight: 48 }}
      />
    </Box>
  )
}

/** A reply the coach prepared for a customer; the owner sends it with one tap. */
export function ReplyCard({
  action,
  onSend,
}: {
  action: CoachAction
  onSend: (action: CoachAction) => Promise<boolean>
}) {
  const roles = useTheme().material
  const c = useActionCopy()
  const [state, setState] = useState<'ready' | 'sent' | 'dismissed' | 'failed'>('ready')
  if (state === 'dismissed') return null
  const done = state === 'sent'
  return (
    <Box component="li" sx={{ pl: { xs: 0, sm: 10 }, ...enterRise }}>
      <Box
        sx={{
          borderRadius: `${shape.xl}px`,
          bgcolor: done ? roles.surfaceContainer : roles.surfaceContainerLow,
          border: `1px solid ${done ? roles.outlineVariant : roles.primary}`,
          p: 4,
        }}
      >
        <Stack spacing={2}>
          <Typography component="h3" variant="titleSmall">
            {action.label}
          </Typography>
          {action.question && (
            <Box>
              <Typography variant="labelMedium" color="text.secondary">
                {c.customerAsked}
              </Typography>
              <Typography variant="bodyMedium" sx={{ overflowWrap: 'anywhere' }}>
                {action.question}
              </Typography>
            </Box>
          )}
          <Box>
            <Typography variant="labelMedium" color="text.secondary">
              {c.yourReply}
            </Typography>
            <RichText content={action.text} />
          </Box>
          {done ? (
            <Typography variant="labelLarge" color="primary" role="status">
              {c.sent}
            </Typography>
          ) : (
            <>
              <Typography variant="bodySmall" color="text.secondary" role="status">
                {state === 'failed' ? c.failed : c.hint}
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  startIcon={<Send size={18} />}
                  onClick={async () => {
                    // Optimistic: the card shows Sent at once and rolls back if sending fails.
                    setState('sent')
                    if (!(await onSend(action))) setState('failed')
                  }}
                >
                  {c.send}
                </Button>
                <Button onClick={() => setState('dismissed')}>{c.notNow}</Button>
              </Stack>
            </>
          )}
        </Stack>
      </Box>
    </Box>
  )
}

/** Review line for "closed today": the date it applies to, or reopening. */
export function ClosedTodayNote({ closedOn, before }: { closedOn: string; before?: string }) {
  const c = useActionCopy()
  if (!closedOn && !before) return null
  return (
    <Typography variant="bodyLarge" sx={{ fontWeight: 500 }}>
      {closedOn ? c.closedToday(closedOn) : c.openToday}
    </Typography>
  )
}
