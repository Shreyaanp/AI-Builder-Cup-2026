import { alpha, createTheme } from '@mui/material/styles'
import type { CSSProperties } from 'react'
import generatedRoles from './material-roles.generated.json'
import { FONT_STACK } from '../i18n/fonts'

export type Appearance = 'light' | 'dark'
/** The user's choice; `system` follows prefers-color-scheme. */
export type ColorMode = Appearance | 'system'
export const layout = { pageWidth: 1160, edge: 4, cardPadding: 6, gap: 4, target: 48 }

/** M3 shape scale (dp). Components pick a step by size and role, never "max radius everywhere". */
export const shape = { xs: 4, sm: 8, md: 12, lg: 16, lgIncreased: 20, xl: 28, full: 9999 }

/** M3 window size classes (dp == CSS px on the web). */
export const windowClass = { medium: 600, expanded: 840, large: 1200 }

// Generated with Google's official color utilities; screens consume semantic roles.
export function materialRoles(mode: Appearance) {
  return generatedRoles[mode]
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
  }
  interface ThemeOptions {
    material?: MaterialRoles
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
  displaySmall: role(36, 44, 400, 0),
  headlineLarge: role(32, 40, 400, 0),
  headlineMedium: role(28, 36, 400, 0),
  headlineSmall: role(24, 32, 400, 0),
  titleLarge: role(22, 28, 400, 0),
  titleMedium: role(16, 24, 500, 0.15),
  titleSmall: role(14, 20, 500, 0.1),
  bodyLarge: role(16, 24, 400, 0.5),
  bodyMedium: role(14, 20, 400, 0.25),
  bodySmall: role(12, 16, 400, 0.4),
  labelLarge: role(14, 20, 500, 0.1),
  labelMedium: role(12, 16, 500, 0.5),
  labelSmall: role(11, 16, 500, 0.5),
}

export function nivaTheme(mode: Appearance) {
  const roles = materialRoles(mode)
  return createTheme({
    material: roles,
    spacing: 4,
    shape: { borderRadius: shape.lg },
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
      ...typeScale,
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
      body1: typeScale.bodyLarge,
      body2: typeScale.bodyMedium,
      button: { ...typeScale.labelLarge, textTransform: 'none' },
      caption: typeScale.bodySmall,
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
          html: { colorScheme: mode },
          body: { margin: 0, minWidth: 280, backgroundColor: roles.surface },
          '*, *::before, *::after': { boxSizing: 'border-box' },
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
            transition:
              'background-color 150ms ease, box-shadow 150ms ease, border-color 150ms ease',
          },
          outlined: { borderColor: roles.outline },
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
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { borderRadius: shape.md, backgroundImage: 'none' } },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiChip: { styleOverrides: { root: { borderRadius: shape.sm } } },
      MuiDialog: {
        defaultProps: { fullWidth: true, maxWidth: 'sm' },
        styleOverrides: {
          paper: { borderRadius: shape.xl, backgroundColor: roles.surfaceContainerHigh },
        },
      },
      MuiDialogTitle: { styleOverrides: { root: typeScale.headlineSmall } },
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
