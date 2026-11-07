import { Box } from '@mui/material'
import { layout, shape } from './theme'

/**
 * The one Chalkboard logo: the tilted chalk-tile mark and the wordmark. Every front door and both
 * apps use this component, so size, shape and colour cannot drift page by page. `wordmark="wide"`
 * shows only the mark on phones where the header is crowded; the link keeps the name as its label.
 */
export function BrandLogo({
  name = 'Chalkboard',
  href,
  wordmark = 'always',
  large = false,
}: {
  name?: string
  href?: string
  wordmark?: 'always' | 'wide'
  /** Headline size, for a screen whose other top-level text is also headlineSmall (Coach). */
  large?: boolean
}) {
  return (
    <Box
      component={href ? 'a' : 'span'}
      href={href}
      data-brand-logo=""
      aria-label={href && wordmark === 'wide' ? name : undefined}
      translate="no"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        minHeight: 48,
        color: 'text.primary',
        // The theme's title size (titleLarge), so the logo adds no type size of its own (OB-31).
        ...(large ? { typography: 'headlineSmall' } : { fontSize: '1.375rem' }),
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
        sx={
          wordmark === 'wide' ? { '@media (max-width: 599.95px)': { display: 'none' } } : undefined
        }
      >
        {name}
      </Box>
    </Box>
  )
}
