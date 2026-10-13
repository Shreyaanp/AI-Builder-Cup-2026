import { createTheme } from '@mui/material/styles'
import generatedRoles from './material-roles.generated.json'

export type Appearance = 'light' | 'dark'
export const layout = { pageWidth: 1160, edge: 4, cardPadding: 6, gap: 4, target: 48 }

// Generated with Google's official color utilities; screens consume semantic roles.
export function materialRoles(mode: Appearance) {
  return generatedRoles[mode]
}
export type MaterialRoles = ReturnType<typeof materialRoles>
declare module '@mui/material/styles' {
  interface Theme {
    material: MaterialRoles
  }
  interface ThemeOptions {
    material?: MaterialRoles
  }
}

export function nivaTheme(mode: Appearance) {
  const roles = materialRoles(mode)
  return createTheme({
    material: roles,
    spacing: 4,
    shape: { borderRadius: 16 },
    palette: {
      mode,
      primary: { main: roles.primary, contrastText: roles.onPrimary },
      secondary: { main: roles.secondary, contrastText: roles.onSecondary },
      error: { main: roles.error, contrastText: roles.onError },
      background: { default: roles.surface, paper: roles.surfaceContainerLow },
      text: { primary: roles.onSurface, secondary: roles.onSurfaceVariant },
      divider: roles.outlineVariant,
    },
    typography: {
      fontFamily: '"Roboto Variable", "Noto Sans Devanagari", sans-serif',
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
      body1: { fontSize: '1rem', lineHeight: '1.5rem' },
      body2: { fontSize: '0.875rem', lineHeight: '1.25rem' },
      button: {
        fontSize: '0.875rem',
        lineHeight: '1.25rem',
        fontWeight: 600,
        textTransform: 'none',
      },
      caption: { fontSize: '0.75rem', lineHeight: '1rem' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { margin: 0, minWidth: 280 },
          '*, *::before, *::after': { boxSizing: 'border-box' },
          'button, a, input, textarea': { WebkitTapHighlightColor: 'transparent' },
          ':focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: '3px' },
          '::selection': {
            backgroundColor: roles.primaryContainer,
            color: roles.onPrimaryContainer,
          },
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
          root: {
            minHeight: layout.target,
            borderRadius: 20,
            paddingInline: 20,
            transition:
              'background-color 150ms ease, box-shadow 150ms ease, border-color 150ms ease',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { minWidth: layout.target, minHeight: layout.target } },
      },
      MuiOutlinedInput: {
        styleOverrides: { root: { borderRadius: 16 }, input: { fontSize: '1rem' } },
      },
      MuiDialog: { defaultProps: { fullWidth: true, maxWidth: 'sm' } },
      MuiDialogTitle: { styleOverrides: { root: { fontSize: '1.375rem', lineHeight: '1.75rem' } } },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: { minHeight: 64, minWidth: 72 },
          label: { fontSize: '0.875rem', '&.Mui-selected': { fontSize: '0.875rem' } },
        },
      },
    },
  })
}
