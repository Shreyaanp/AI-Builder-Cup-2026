import { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot } from '@material/material-color-utilities'

const source = '#496954'
const names = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiaryContainer',
  'onTertiaryContainer',
  'surface',
  'surfaceContainer',
  'surfaceContainerLow',
  'surfaceContainerHigh',
  'onSurface',
  'onSurfaceVariant',
  'outline',
  'outlineVariant',
  'error',
  'onError',
]
export default Object.fromEntries(
  ['light', 'dark'].map((mode) => {
    const scheme = new SchemeTonalSpot(
      Hct.fromInt(argbFromHex(source)),
      mode === 'dark',
      0,
      '2025',
      'phone',
    )
    return [mode, Object.fromEntries(names.map((name) => [name, hexFromArgb(scheme[name])]))]
  }),
)
