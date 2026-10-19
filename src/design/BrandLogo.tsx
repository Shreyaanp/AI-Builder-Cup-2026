import { Box } from '@mui/material'
import { layout, shape } from './theme'

/** Visually hidden but still read aloud: the name stays for screen readers on phones. */
const hidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const

/**
 * The one Chalkboard logo: the tilted chalk-tile mark and the wordmark. Every front door and both
 * apps use this component, so size, shape and colour cannot drift page by page. `wordmark="wide"`
 * hides the name visually on phones where the header is crowded; the mark stays.
 */
export function BrandLogo({
  name = 'Chalkboard',
  href,
  wordmark = 'always',
}: {
  name?: string
  href?: string
  wordmark?: 'always' | 'wide'
}) {
  return (
    <Box
      component={href ? 'a' : 'span'}
      href={href}
      data-brand-logo=""
      translate="no"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2.5,
        minHeight: 48,
        color: 'text.primary',
        fontSize: '1.25rem',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        textDecoration: 'none',
        flexShrink: 0,
        // Mark only on a phone: still a 48px target.
        ...(wordmark === 'wide' && {
          '@media (max-width: 599.95px)': { minWidth: layout.target, justifyContent: 'center' },
        }),
      }}
    >
      <Box
        component="span"
        aria-hidden="true"
        data-brand-mark=""
        sx={{
          width: 28,
          height: 28,
          bgcolor: 'primary.main',
          borderRadius: `${shape.md - 3}px ${shape.md - 3}px ${shape.md - 3}px 2px`,
          transform: 'rotate(-8deg)',
          flexShrink: 0,
        }}
      />
      <Box
        component="span"
        data-brand-name=""
        sx={wordmark === 'wide' ? { '@media (max-width: 599.95px)': hidden } : undefined}
      >
        {name}
      </Box>
    </Box>
  )
}
