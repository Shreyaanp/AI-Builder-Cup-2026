import { chalkTones } from './chalkboard'
import { materialRoles, nivaTheme, type Appearance } from './theme'

/**
 * The customer app: the same Chalkboard roles as the owner app, with the full chalk energy
 * (deeper press-down buttons, pill chips). Photos keep their colour.
 */
export function customerTheme(mode: Appearance) {
  const theme = nivaTheme(mode, materialRoles(mode), 'customer')
  const tones = chalkTones[mode]
  theme.components!.MuiCssBaseline!.styleOverrides = {
    ...(theme.components!.MuiCssBaseline!.styleOverrides as object),
    ':root': { '--customer-open': tones.mint.main },
  }
  theme.palette.success = { ...theme.palette.success, main: tones.mint.main }
  theme.palette.warning = { ...theme.palette.warning, main: tones.sunflower.main }
  theme.palette.info = { ...theme.palette.info, main: tones.sky.main }
  return theme
}
