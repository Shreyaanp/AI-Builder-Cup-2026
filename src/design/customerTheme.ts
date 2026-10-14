import { materialRoles, nivaTheme, type Appearance, type MaterialRoles } from './theme'

/** Customer-only neutral roles. Owner roles and meaningful error colours stay intact. */
export function customerTheme(mode: Appearance) {
  const dark = mode === 'dark'
  const ink = dark ? '#fafafa' : '#111111'
  const surface = dark ? '#111111' : '#f3f3f3'
  const container = dark ? '#242424' : '#eeeeee'
  const secondaryInk = dark ? '#c6c6c6' : '#555555'
  const roles: MaterialRoles = {
    ...materialRoles(mode),
    primary: ink,
    onPrimary: surface,
    primaryContainer: container,
    onPrimaryContainer: ink,
    secondary: ink,
    onSecondary: surface,
    secondaryContainer: container,
    onSecondaryContainer: ink,
    tertiary: ink,
    onTertiary: surface,
    tertiaryContainer: container,
    onTertiaryContainer: ink,
    surface,
    surfaceDim: dark ? '#111111' : '#dddddd',
    surfaceBright: dark ? '#333333' : '#ffffff',
    surfaceContainerLowest: dark ? '#000000' : '#ffffff',
    surfaceContainerLow: dark ? '#191919' : '#ffffff',
    surfaceContainer: dark ? '#202020' : '#e7e7e7',
    surfaceContainerHigh: container,
    surfaceContainerHighest: dark ? '#303030' : '#e4e4e4',
    onSurface: ink,
    onSurfaceVariant: secondaryInk,
    inverseSurface: ink,
    inverseOnSurface: surface,
    inversePrimary: surface,
    outline: dark ? '#999999' : '#707070',
    outlineVariant: dark ? '#777777' : '#999999',
  }
  const theme = nivaTheme(mode, roles)
  theme.components!.MuiCssBaseline!.styleOverrides = {
    ...(theme.components!.MuiCssBaseline!.styleOverrides as object),
    ':root': { '--customer-open': dark ? '#8fd3ab' : '#146c43' },
    '[data-customer] img': { filter: 'grayscale(1)' },
  }
  // Informational/success/warning messages remain monochrome on customer pages.
  for (const severity of ['info', 'success', 'warning'] as const) {
    theme.palette[severity] = { ...theme.palette.primary }
  }
  return theme
}
