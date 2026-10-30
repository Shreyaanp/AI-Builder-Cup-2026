import { alpha, createTheme, darken } from '@mui/material/styles'
import type { CSSProperties } from 'react'
import { FONT_STACK } from '../i18n/fonts.js'
import { chalkDust, chalkRoles, chalkTones } from './chalkboard.js'
import type { ChalkTone, FeatureKey } from './chalkboard.js'

export type Appearance = 'light' | 'dark'
/** Owner tools stay calm; the customer app gets the full chalk energy (owner decision). */
export type Audience = 'owner' | 'customer'
/** Handwritten chalk accent: short headings, prices and notes only. */
export const HAND_FONT = `"Caveat", ${FONT_STACK}`
/** The user's choice; `system` follows prefers-color-scheme. */
export type ColorMode = Appearance | 'system'
export const layout = { pageWidth: 1160, edge: 4, cardPadding: 6, gap: 4, target: 48, appBar: 64 }

/** M3 shape scale (dp). Components pick a step by size and role, never "max radius everywhere". */
export const shape = { xs: 4, sm: 8, md: 12, lg: 16, lgIncreased: 20, xl: 28, full: 9999 }

/** M3 window size classes (dp == CSS px on the web). */
export const windowClass = { medium: 600, expanded: 840, large: 1200 }

/**
 * M3 motion tokens. Enter with emphasized-decelerate (long), exit with emphasized-accelerate
 * (short). Animate transform/opacity only; the global reduced-motion rule makes these instant.
 */
export const motion = {
  easing: {
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
    // Rewards: a little past the target, then settle; and a fast-in stamp landing.
    overshoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    thud: 'cubic-bezier(0.7, 0, 0.84, 0)',
  },
  duration: { short: 200, medium: 300, enter: 400, exit: 200 },
}

/** Card entrance: fade + small rise. Spread into `sx`. */
export const enterRise = {
  '@keyframes enterRise': {
    from: { opacity: 0, transform: 'translateY(12px)' },
    to: { opacity: 1, transform: 'none' },
  },
  animation: `enterRise ${motion.duration.enter}ms ${motion.easing.emphasizedDecelerate} both`,
}

/** A value that just changed fades in over the old one. Spread into `sx`. */
export const fieldFade = {
  '@keyframes fieldFade': {
    from: { opacity: 0, transform: 'translateY(4px)' },
    to: { opacity: 1, transform: 'none' },
  },
  animation: `fieldFade ${motion.duration.medium}ms ${motion.easing.emphasizedDecelerate} both`,
}

// Chalkboard roles (kraft-paper light, chalkboard dark); screens consume semantic roles.
export function materialRoles(mode: Appearance) {
  return chalkRoles[mode]
}
export type MaterialRoles = ReturnType<typeof materialRoles>

type TypeRole =
  | 'displaySmall'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'titleLarge'
  | 'titleMedium'
  | 'titleSmall'
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall'

declare module '@mui/material/styles' {
  interface Theme {
    material: MaterialRoles
    chalk: Record<FeatureKey, ChalkTone>
    audience: Audience
  }
  interface ThemeOptions {
    material?: MaterialRoles
    chalk?: Record<FeatureKey, ChalkTone>
    audience?: Audience
  }
  // MUI's documented pattern for custom typography variants is interface merging.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TypographyVariants extends Record<TypeRole, CSSProperties> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TypographyVariantsOptions extends Partial<Record<TypeRole, CSSProperties>> {}
}
declare module '@mui/material/Typography' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TypographyPropsVariantOverrides extends Record<TypeRole, true> {}
}

// A plain type alias is assignable both to React and to MUI's CSS property types.
type TypeStyle = { fontSize: string; lineHeight: string; fontWeight: number; letterSpacing: string }

function role(size: number, line: number, weight: number, tracking: number): TypeStyle {
  return {
    fontSize: `${size / 16}rem`,
    lineHeight: `${line / 16}rem`,
    fontWeight: weight,
    letterSpacing: `${tracking / size}em`,
  }
}

/** M3 type scale (baseline). Google Sans Flex, Roboto fallback; CJK/Thai/Tamil script fonts load per locale. */
const typeScale: Record<TypeRole, TypeStyle> = {
  displaySmall: role(36, 44, 700, -0.5),
  headlineLarge: role(32, 40, 700, -0.25),
  headlineMedium: role(28, 36, 650, 0),
  headlineSmall: role(24, 32, 650, 0),
  titleLarge: role(22, 28, 600, 0),
  titleMedium: role(16, 24, 600, 0.15),
  titleSmall: role(14, 20, 600, 0.1),
  bodyLarge: role(16, 24, 400, 0.5),
  bodyMedium: role(16, 24, 400, 0.25),
  bodySmall: role(14, 20, 400, 0.25),
  labelLarge: role(14, 20, 500, 0.1),
  labelMedium: role(14, 20, 500, 0.3),
  labelSmall: role(12, 16, 500, 0.5),
}

/** The one size the handwritten font is set at: the scale's headlineLarge (A-22: three sizes per screen). */
export const HAND_SIZE = typeScale.headlineLarge.fontSize

// Phones (below 600px): the whole scale one step smaller, with slightly tighter tracking (OB-198).
// Roles that share a size on larger windows still share one here, so a screen keeps the same
// number of sizes: body 15px, labels and small text 13px, nothing below 12px (OB-116, OB-103).
// Controls keep their 48px height; only their text shrinks.
const compactQuery = `@media (max-width:${windowClass.medium - 1}px)`
const compactScale: Record<TypeRole, TypeStyle> = {
  displaySmall: role(32, 40, 700, -0.5),
  headlineLarge: role(28, 36, 700, -0.25),
  headlineMedium: role(24, 32, 650, 0),
  headlineSmall: role(22, 28, 650, 0),
  titleLarge: role(20, 28, 600, 0),
  titleMedium: role(15, 22, 600, 0.1),
  titleSmall: role(13, 18, 600, 0.1),
  bodyLarge: role(15, 22, 400, 0.15),
  bodyMedium: role(15, 22, 400, 0.1),
  bodySmall: role(13, 18, 400, 0.2),
  labelLarge: role(13, 18, 500, 0.05),
  labelMedium: role(13, 18, 500, 0.3),
  labelSmall: role(12, 16, 500, 0.4),
}
// The phone sizes are CSS variables set on :root under the phone query (CssBaseline below), with
// the larger sizes as fallbacks. A media query inside a variant would come after a component's own
// sx in the same rule and override it (a 22px handwritten line set at the 15px body size).
const typeVar = (key: TypeRole, part: string, fallback: string) =>
  `var(--type-${key}-${part}, ${fallback})`
const responsiveScale = Object.fromEntries(
  (Object.keys(typeScale) as TypeRole[]).map((key) => [
    key,
    {
      fontSize: typeVar(key, 'size', typeScale[key].fontSize),
      lineHeight: typeVar(key, 'line', typeScale[key].lineHeight),
      fontWeight: typeScale[key].fontWeight,
      letterSpacing: typeVar(key, 'tracking', typeScale[key].letterSpacing),
    },
  ]),
) as Record<TypeRole, TypeStyle>
// The front doors' headline keeps its full display size on phones (36px, 1.1 leading, tight tracking).
// It is not a role, so the 13 roles stay as they are: --type-hero-size/-line/-tracking.
const heroPhone = role(36, 40, 700, -1.6)
const compactTypeVars = Object.fromEntries(
  [
    ['--type-hero-size', heroPhone.fontSize],
    ['--type-hero-line', heroPhone.lineHeight],
    ['--type-hero-tracking', heroPhone.letterSpacing],
  ].concat((Object.keys(compactScale) as TypeRole[]).flatMap((key) => [
    [`--type-${key}-size`, compactScale[key].fontSize],
    [`--type-${key}-line`, compactScale[key].lineHeight],
    [`--type-${key}-tracking`, compactScale[key].letterSpacing],
  ])),
)
// Fields stay 16px on phones (OB-198): iOS zooms into smaller inputs, and the floating label (75%
// of this) stays at 12px.
const fieldText = { fontSize: '1rem', lineHeight: '1.5rem' }

export function nivaTheme(
  mode: Appearance,
  roles: MaterialRoles = materialRoles(mode),
  audience: Audience = 'owner',
) {
  // Chunky press-down buttons (Direction 2 touch): a hard bottom edge that sinks on press.
  const depth = audience === 'customer' ? 4 : 2
  const edge = darken(roles.primary, mode === 'dark' ? 0.45 : 0.4)
  return createTheme({
    material: roles,
    chalk: chalkTones[mode],
    audience,
    spacing: 4,
    shape: { borderRadius: shape.lg },
    transitions: {
      easing: {
        easeOut: motion.easing.emphasizedDecelerate,
        sharp: motion.easing.emphasizedAccelerate,
      },
    },
    palette: {
      mode,
      primary: { main: roles.primary, contrastText: roles.onPrimary },
      secondary: { main: roles.secondary, contrastText: roles.onSecondary },
      error: { main: roles.error, contrastText: roles.onError },
      background: { default: roles.surface, paper: roles.surfaceContainerLow },
      text: { primary: roles.onSurface, secondary: roles.onSurfaceVariant },
      divider: roles.outlineVariant,
      action: {
        hover: alpha(roles.onSurface, 0.08),
        focus: alpha(roles.onSurface, 0.1),
        selected: alpha(roles.onSurface, 0.1),
        disabled: alpha(roles.onSurface, 0.38),
        disabledBackground: alpha(roles.onSurface, 0.12),
      },
    },
    typography: {
      fontFamily: FONT_STACK,
      ...responsiveScale,
      // Legacy starter roles (classic screen) remain unchanged.
      h1: {
        fontSize: '2.25rem',
        lineHeight: '2.75rem',
        fontWeight: 450,
        letterSpacing: '-0.035em',
        '@media (min-width:900px)': { fontSize: '2.8125rem', lineHeight: '3.25rem' },
      },
      h2: {
        fontSize: '1.375rem',
        lineHeight: '1.75rem',
        fontWeight: 500,
        letterSpacing: '-0.015em',
      },
      h3: { fontSize: '1rem', lineHeight: '1.5rem', fontWeight: 600 },
      body1: responsiveScale.bodyLarge,
      body2: responsiveScale.bodyMedium,
      button: { ...responsiveScale.labelLarge, textTransform: 'none' },
      caption: responsiveScale.bodySmall,
    },
    components: {
      MuiTypography: {
        defaultProps: {
          variantMapping: {
            displaySmall: 'h1',
            headlineLarge: 'h1',
            headlineMedium: 'h1',
            headlineSmall: 'h2',
            titleLarge: 'h2',
            titleMedium: 'h3',
            titleSmall: 'h3',
            bodyLarge: 'p',
            bodyMedium: 'p',
            bodySmall: 'p',
            labelLarge: 'span',
            labelMedium: 'span',
            labelSmall: 'span',
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            [compactQuery]: compactTypeVars,
            // The logo's size, which the front doors' lead lines match on every window.
            '--type-logo-size': typeScale.titleLarge.fontSize,
            '--scrollbar-thumb': roles.outlineVariant,
            '--scrollbar-thumb-hover': roles.outline,
            '--art-filter': mode === 'dark' ? 'brightness(0.72) saturate(0.8)' : 'none',
          },
          html: {
            colorScheme: mode,
            scrollbarWidth: 'thin',
            scrollbarColor: `${roles.outlineVariant} transparent`,
          },
          body: {
            margin: 0,
            minWidth: 280,
            backgroundColor: roles.surface,
            // A faint chalk grain on the board; paper stays clean.
            ...(mode === 'dark' && { backgroundImage: chalkDust }),
          },
          '*, *::before, *::after': { boxSizing: 'border-box' },
          '*': {
            scrollbarWidth: 'thin',
            scrollbarColor: `${roles.outlineVariant} transparent`,
          },
          '*::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '*::-webkit-scrollbar-track': {
            backgroundColor: 'transparent',
          },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: roles.outlineVariant,
            borderRadius: 8,
          },
          '*::-webkit-scrollbar-thumb:hover': {
            backgroundColor: roles.outline,
          },
          // Pastel illustrations glare on the dark board: tone them down with one token (OB-100).
          'img[src^="/art/"], img[src^="/icons/"]': { filter: 'var(--art-filter)' },
          'button, a, input, textarea': { WebkitTapHighlightColor: 'transparent' },
          ':focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: '2px' },
          '::selection': {
            backgroundColor: roles.primaryContainer,
            color: roles.onPrimaryContainer,
          },
          '.skip-link': {
            position: 'absolute',
            left: -10000,
            top: 8,
            zIndex: 2000,
            // A 48px target whatever the text size (OB-198 made phone text smaller).
            display: 'flex',
            alignItems: 'center',
            minHeight: layout.target,
            padding: '12px 16px',
            borderRadius: shape.sm,
            backgroundColor: roles.inverseSurface,
            color: roles.inverseOnSurface,
          },
          '.skip-link:focus': { left: 16 },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animation: 'none !important',
              transition: 'none !important',
              scrollBehavior: 'auto !important',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          // M3 buttons: 40dp container, full shape; 48dp minimum target for shop-floor use.
          root: {
            minHeight: layout.target,
            borderRadius: shape.full,
            paddingInline: 24,
            paddingBlock: 8,
            // OB-156: control sizes change containers, not the screen's type scale.
            '&.MuiButton-sizeSmall, &.MuiButton-sizeLarge': {
              ...responsiveScale.labelLarge,
              paddingBlock: 8,
            },
            fontWeight: 600,
            transition:
              'background-color 150ms ease, box-shadow 120ms ease, border-color 150ms ease, transform 120ms ease',
          },
          contained: ({ theme, ownerState }) => {
            // M3 hover state layer: the container keeps its colour and gets an 8% tint of its
            // label colour. MUI's default (a darker container) drops the dark-mode sunflower
            // button below AA contrast for its dark label.
            const color = ownerState.color
            const palette =
              color && color !== 'inherit' && color in theme.palette
                ? (theme.palette[color as 'primary'] as { main: string; contrastText: string })
                : null
            const layer = palette ? alpha(palette.contrastText, 0.08) : null
            return {
              boxShadow: `0 ${depth}px 0 ${edge}`,
              '&:hover': {
                boxShadow: `0 ${depth}px 0 ${edge}`,
                ...(palette &&
                  layer && {
                    backgroundColor: palette.main,
                    backgroundImage: `linear-gradient(${layer}, ${layer})`,
                  }),
              },
              '&:active': { transform: `translateY(${depth - 1}px)`, boxShadow: `0 1px 0 ${edge}` },
              '&.Mui-disabled': { boxShadow: 'none', backgroundImage: 'none' },
            }
          },
          outlined: { borderColor: roles.outline, borderWidth: audience === 'customer' ? 2 : 1 },
          // A-25: a text button's label sits one 16px step inside its box; 24px left the icon
          // 40px in from the gutter.
          text: {
            paddingInline: 16,
            // The icon is not pulled out past the label's padding either: it sits on the 16px.
            '& .MuiButton-startIcon': { marginLeft: 0 },
            '& .MuiButton-endIcon': { marginRight: 0 },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { minWidth: layout.target, minHeight: layout.target } },
      },
      MuiFab: {
        styleOverrides: { root: { borderRadius: shape.lg, boxShadow: 'none' } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: shape.xs, '& fieldset': { borderColor: roles.outline } },
          input: { fontSize: '1rem' },
        },
      },
      MuiInputBase: { styleOverrides: { root: fieldText } },
      MuiInputLabel: { styleOverrides: { root: fieldText } },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { borderRadius: shape.lgIncreased, backgroundImage: 'none' } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      // OB-156: feedback and control internals follow the shared 4px grid.
      MuiAlert: {
        styleOverrides: {
          root: { paddingBlock: 8 },
          icon: { paddingBlock: 8 },
          action: { paddingTop: 0 },
        },
      },
      MuiChip: {
        styleOverrides: {
          label: { paddingInline: 12 },
          root: {
            ...responsiveScale.labelLarge,
            borderRadius: audience === 'customer' ? shape.full : shape.sm,
            fontWeight: 500,
            // Chips you can tap are 48px tall, like every other control (OB-115).
            '&.MuiChip-clickable, &.MuiChip-deletable': { minHeight: layout.target },
          },
        },
      },
      // Switches, checkboxes, radios and their labels are 48px targets (OB-115).
      MuiSwitch: {
        styleOverrides: {
          root: {
            height: layout.target,
            paddingBlock: 17,
            '& .MuiSwitch-switchBase': { padding: 14 },
          },
        },
      },
      MuiCheckbox: { styleOverrides: { root: { padding: 12 } } },
      MuiRadio: { styleOverrides: { root: { padding: 12 } } },
      MuiFormControlLabel: { styleOverrides: { root: { minHeight: layout.target } } },
      MuiToggleButton: { styleOverrides: { root: { minHeight: layout.target } } },
      MuiDialog: {
        defaultProps: { fullWidth: true, maxWidth: 'sm' },
        styleOverrides: {
          paper: {
            borderRadius: shape.xl,
            backgroundColor: roles.surfaceContainerHigh,
            // A-38: a full-screen dialog has no outer corners (grey slivers showed at the edges).
            '&.MuiDialog-paperFullScreen': { borderRadius: 0 },
          },
        },
      },
      MuiDialogTitle: { styleOverrides: { root: responsiveScale.headlineSmall } },
      MuiDrawer: { styleOverrides: { paper: { backgroundColor: roles.surfaceContainerLow } } },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: shape.xs, backgroundColor: roles.surfaceContainer },
        },
      },
      MuiListItemButton: {
        styleOverrides: { root: { borderRadius: shape.full, minHeight: 56 } },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            borderRadius: shape.xs,
            backgroundColor: roles.inverseSurface,
            color: roles.inverseOnSurface,
          },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: { minHeight: 64, minWidth: 72 },
          label: { fontSize: '0.875rem', '&.Mui-selected': { fontSize: '0.875rem' } },
        },
      },
    },
  })
}

/**
 * Sx helper for horizontal chip rows, tabs, and carousels:
 * - Hidden scrollbar on touch devices to keep touch carousels clean.
 * - On desktop / mouse hover, reveals a thin, rounded thumb so mouse users have a clear scroll cue.
 */
export const scrollArea = {
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': {
    width: 6,
    height: 6,
    display: 'none',
  },
  '@media (hover: hover) and (pointer: fine)': {
    '&:hover': {
      scrollbarWidth: 'thin',
      scrollbarColor: 'var(--scrollbar-thumb) transparent',
      '&::-webkit-scrollbar': {
        display: 'block',
      },
      '&::-webkit-scrollbar-track': {
        backgroundColor: 'transparent',
      },
      '&::-webkit-scrollbar-thumb': {
        backgroundColor: 'var(--scrollbar-thumb)',
        borderRadius: 6,
      },
      '&::-webkit-scrollbar-thumb:hover': {
        backgroundColor: 'var(--scrollbar-thumb-hover)',
      },
    },
  },
} as const
