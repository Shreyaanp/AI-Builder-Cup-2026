import { Box, Typography } from '@mui/material'
import { chalkRoles } from '../design/chalkboard'
import { HAND_FONT, motion } from '../design/theme'

/**
 * Shown while Google's sign-in window is open and until the account is ready, so the app never
 * looks frozen and then jumps. The board stays dark in both themes: it is a brand moment.
 */
export function SignInOverlay({ phase }: { phase: 'waiting' | 'finishing' }) {
  const board = chalkRoles.dark
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'grid',
        placeItems: 'center',
        bgcolor: board.surface,
        color: board.onSurface,
        textAlign: 'center',
        px: 4,
        '@keyframes boardIn': { from: { opacity: 0 }, to: { opacity: 1 } },
        animation: `boardIn 240ms ${motion.easing.emphasizedDecelerate} both`,
      }}
    >
      <Box sx={{ maxWidth: 360 }}>
        <Box
          component="svg"
          viewBox="0 0 220 60"
          aria-hidden="true"
          sx={{
            width: 220,
            height: 60,
            display: 'block',
            mx: 'auto',
            mb: 3,
            '& path': {
              fill: 'none',
              stroke: board.primary,
              strokeWidth: 4,
              strokeLinecap: 'round',
              strokeDasharray: 300,
              '@keyframes chalkSketch': {
                '0%': { strokeDashoffset: 300 },
                '60%': { strokeDashoffset: 0 },
                '100%': { strokeDashoffset: -300 },
              },
              animation: `chalkSketch 1.6s ${motion.easing.standard} infinite`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none', strokeDashoffset: 0 },
            },
          }}
        >
          <path d="M10 40 C 40 10, 70 50, 100 28 S 160 12, 210 34" />
        </Box>
        <Typography
          sx={{ fontFamily: HAND_FONT, fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.1 }}
        >
          {phase === 'waiting' ? 'Connecting to Google…' : 'Opening your shop…'}
        </Typography>
        <Typography variant="bodyLarge" sx={{ mt: 2, color: board.onSurfaceVariant }}>
          {phase === 'waiting'
            ? 'A Google window opened. Pick your account there, then come back here.'
            : 'Signed in. Getting everything ready.'}
        </Typography>
      </Box>
    </Box>
  )
}
