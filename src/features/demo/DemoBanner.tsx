import type { MouseEventHandler, Ref } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useDemoCopy } from '../frontdoors/strings'

/**
 * The notice above every demo screen: what this is, a way to switch between the owner's and the
 * customer's view, and Exit demo. The customer demo's steps open the real shop page and Passport;
 * they carry the same banner, so Exit demo is one tap away on every step.
 */
export function DemoBanner({
  customer,
  onExit,
  onSwitch,
  ref,
}: {
  /** The customer side of the demo (the other link goes to the owner side). */
  customer: boolean
  onExit: () => void
  /** Moves between the demo's two sides without a page load (inside the demo app). */
  onSwitch?: MouseEventHandler<HTMLElement>
  ref?: Ref<HTMLElement>
}) {
  const t = useDemoCopy()
  return (
    <Box
      component="header"
      ref={ref}
      data-testid="demo-banner"
      sx={{
        px: 4,
        pt: 'env(safe-area-inset-top)',
        bgcolor: (theme) => theme.material.secondaryContainer,
        color: (theme) => theme.material.onSecondaryContainer,
      }}
    >
      {/* Keep the whole notice readable; move actions below it when space is tight. */}
      <Stack
        direction="row"
        sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 2, minHeight: 48 }}
      >
        <Typography
          variant="bodySmall"
          sx={{ flex: '1 0 auto', maxWidth: '100%', py: 1, overflowWrap: 'anywhere' }}
        >
          {t.banner}
        </Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, ml: 'auto', maxWidth: '100%' }}>
          <Button
            size="small"
            href={customer ? '/demo' : '/explore/demo'}
            onClick={onSwitch}
            sx={{ minHeight: 48, minWidth: 0, px: 1, flexShrink: 0 }}
          >
            {customer ? t.owner : t.customer}
          </Button>
          <Button
            size="small"
            onClick={onExit}
            sx={{ minHeight: 48, minWidth: 0, px: 1, flexShrink: 0 }}
          >
            {t.exit}
          </Button>
        </Stack>
      </Stack>
    </Box>
  )
}
