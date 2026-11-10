import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { visuallyHidden } from '@mui/utils'
import { Check, Circle, Hand } from 'lucide-react'
import { enterRise, shape } from '../../design/theme'
import { usePlanCopy } from './planCopy'
import type { PlanState } from './planState'

/**
 * The steps of a request with several steps (OB-174), under the card it waits for: ticked when
 * done, the next one with the one tap that carries it on, and Stop. The tap itself is on the
 * card (or the review); this list never adds a second way to approve.
 */
export function PlanSteps({
  plan,
  onStop,
  busy,
}: {
  plan: PlanState
  onStop: () => void
  busy: boolean
}) {
  const roles = useTheme().material
  const c = usePlanCopy()
  const done = Math.min(plan.done, plan.steps.length)
  const tap = plan.waiting ? (c.taps[plan.waiting.tap] ?? plan.waiting.tap) : ''
  // Only what is still to do: finished steps are the count in the title, so the card stays
  // short and the card it waits for (its Send) stays in view on a 360 px phone.
  const left = plan.stopped ? [] : plan.steps.slice(done)
  return (
    <Box component="li" sx={{ pl: { xs: 0, sm: 10 }, ...enterRise }}>
      <Box
        role="group"
        aria-labelledby="plan-steps-title"
        sx={{
          border: 1,
          borderColor: roles.outlineVariant,
          borderRadius: `${shape.md}px`,
          bgcolor: roles.surfaceContainerLow,
          px: 4,
          py: 3,
        }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          {!left.length && !plan.stopped && (
            <Box aria-hidden sx={{ display: 'flex', color: roles.primary }}>
              <Check size={18} />
            </Box>
          )}
          <Typography id="plan-steps-title" component="h3" variant="titleSmall">
            {c.title(done, plan.steps.length)}
          </Typography>
        </Stack>
        {left.length > 0 && (
          <Stack component="ol" spacing={2} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2 }}>
            {left.map((step, index) => {
              const next = index === 0
              return (
                <Stack
                  component="li"
                  key={`${done + index}-${step}`}
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: 'flex-start' }}
                >
                  <Box
                    aria-hidden
                    sx={{ mt: 0.5, display: 'flex', color: next ? roles.tertiary : roles.outline }}
                  >
                    {next ? <Hand size={18} /> : <Circle size={18} />}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="bodyMedium" sx={{ overflowWrap: 'anywhere' }}>
                      {next && (
                        <Box component="span" sx={visuallyHidden}>
                          {`${c.next}: `}
                        </Box>
                      )}
                      {step}
                    </Typography>
                    {next && plan.waiting && (
                      <Typography variant="bodyMedium" color="text.secondary">
                        {c.waiting(tap)}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              )
            })}
          </Stack>
        )}
        {plan.stopped && (
          <Typography variant="bodyMedium" color="text.secondary" sx={{ mt: 2 }} role="status">
            {c.stopped}
          </Typography>
        )}
        {plan.waiting && !plan.stopped && (
          <Button disabled={busy} onClick={onStop} sx={{ mt: 1, minHeight: 48, ml: -2 }}>
            {c.stop}
          </Button>
        )}
      </Box>
    </Box>
  )
}
