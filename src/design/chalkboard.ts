/**
 * Chalkboard identity (owner decision, 15 Oct 2026).
 * Light is kraft paper with green ink; dark is the chalkboard itself with chalk-pastel accents.
 * Every pair keeps WCAG AA contrast (≥ 4.5:1 for text on its container).
 */

/** M3 colour roles, same keys as Google's generated scheme. */
export const chalkRoles = {
  light: {
    primary: '#1F5C42',
    onPrimary: '#FFFFFF',
    primaryContainer: '#B7EBCF',
    onPrimaryContainer: '#0A3A27',
    secondary: '#7A5900',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#FFE08A',
    onSecondaryContainer: '#261A00',
    tertiary: '#B23B2A',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#FFDAD3',
    onTertiaryContainer: '#3F0A03',
    surface: '#FBF7EC',
    surfaceDim: '#DDD5C1',
    surfaceBright: '#FBF7EC',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F5F0E2',
    surfaceContainer: '#EFE9D9',
    surfaceContainerHigh: '#E9E2D0',
    surfaceContainerHighest: '#E2DAC6',
    onSurface: '#1B2A22',
    onSurfaceVariant: '#4A564D',
    inverseSurface: '#17271F',
    inverseOnSurface: '#F1EEE3',
    inversePrimary: '#8FD6B0',
    outline: '#7A8478',
    outlineVariant: '#CBC4B0',
    error: '#BA1A1A',
    onError: '#FFFFFF',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#410002',
    scrim: '#000000',
  },
  dark: {
    primary: '#F6C945',
    onPrimary: '#3A2C00',
    primaryContainer: '#5A4500',
    onPrimaryContainer: '#FFE7A1',
    secondary: '#7FD8B4',
    onSecondary: '#003828',
    secondaryContainer: '#1F5240',
    onSecondaryContainer: '#A8F2D2',
    tertiary: '#FF8A78',
    onTertiary: '#5C1308',
    tertiaryContainer: '#7E2A1E',
    onTertiaryContainer: '#FFDAD3',
    surface: '#17271F',
    surfaceDim: '#121F18',
    surfaceBright: '#2E4337',
    surfaceContainerLowest: '#0F1A14',
    surfaceContainerLow: '#1C2E25',
    surfaceContainer: '#21352A',
    surfaceContainerHigh: '#2A4033',
    surfaceContainerHighest: '#344B3D',
    onSurface: '#F1EEE3',
    onSurfaceVariant: '#BFCBBF',
    inverseSurface: '#F1EEE3',
    inverseOnSurface: '#1B2A22',
    inversePrimary: '#1F5C42',
    outline: '#8A9A8D',
    outlineVariant: '#3F5547',
    error: '#FFB4AB',
    onError: '#690005',
    errorContainer: '#93000A',
    onErrorContainer: '#FFDAD6',
    scrim: '#000000',
  },
}

export type ChalkTone = { main: string; onMain: string; container: string; onContainer: string }
export type FeatureKey = 'sunflower' | 'mint' | 'coral' | 'sky' | 'lilac'

/**
 * One chalk colour per feature, so people learn the product by colour:
 * sunflower = passport and rewards, coral = rescue deals, mint = fresh/open/local,
 * sky = chats and community, lilac = AI insights (radar, morning brief).
 */
export const chalkTones: Record<'light' | 'dark', Record<FeatureKey, ChalkTone>> = {
  light: {
    sunflower: { main: '#7A5900', onMain: '#FFFFFF', container: '#FFE08A', onContainer: '#261A00' },
    mint: { main: '#1F6B4F', onMain: '#FFFFFF', container: '#B7EBCF', onContainer: '#0A3A27' },
    coral: { main: '#B23B2A', onMain: '#FFFFFF', container: '#FFDAD3', onContainer: '#3F0A03' },
    sky: { main: '#00658F', onMain: '#FFFFFF', container: '#CDE8FF', onContainer: '#001E2F' },
    lilac: { main: '#6750A4', onMain: '#FFFFFF', container: '#E9DDFF', onContainer: '#22005D' },
  },
  dark: {
    sunflower: { main: '#F6C945', onMain: '#3A2C00', container: '#5A4500', onContainer: '#FFE7A1' },
    mint: { main: '#7FD8B4', onMain: '#003828', container: '#1F5240', onContainer: '#A8F2D2' },
    coral: { main: '#FF8A78', onMain: '#5C1308', container: '#7E2A1E', onContainer: '#FFDAD3' },
    sky: { main: '#8CCBF5', onMain: '#00344F', container: '#0F4A6B', onContainer: '#CDE8FF' },
    lilac: { main: '#CFBCFF', onMain: '#381E72', container: '#4F378B', onContainer: '#E9DDFF' },
  },
}

/** Subtle chalk-dust grain for dark surfaces (inline SVG noise, ~0.5 KB). */
export const chalkDust =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"
