import { useState } from 'react'
import { Box, Button, IconButton, Menu, MenuItem, useTheme } from '@mui/material'
import { HoverTip } from './HoverTip'
import { settingsRowSx } from './settingsRow'
import type { SxProps, Theme } from '@mui/material'
import { Globe } from 'lucide-react'
import { LOCALE_NAMES, LOCALES, systemLocale } from '../../i18n/locales'
import type { LanguagePref } from '../../i18n/locales'
import { useLocale, usePreferences, usePreferencesDispatch } from '../../state/hooks'
import { useCopy } from '../v1/strings'

export function LanguagePicker({
  variant = 'fixed',
  sx,
}: {
  /** `row`: a full-width settings row (the profile sheet) naming the language in use. */
  variant?: 'fixed' | 'nav' | 'inline' | 'row'
  sx?: SxProps<Theme>
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)
  const theme = useTheme()
  const locale = useLocale()
  const preferences = usePreferences()
  const dispatch = usePreferencesDispatch()
  const t = useCopy()

  const currentLabel =
    preferences.language === 'system'
      ? `${t.languageSystem} (${LOCALE_NAMES[systemLocale()]})`
      : (LOCALE_NAMES[locale] ?? LOCALE_NAMES.en)

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleSelect = (code: LanguagePref) => {
    dispatch({ type: 'language', language: code })
    handleClose()
  }

  const fixedSx: SxProps<Theme> = {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
    right: 'calc(env(safe-area-inset-right, 0px) + 64px)',
    zIndex: 1200,
    width: 48,
    height: 48,
    bgcolor: 'background.paper',
    border: 1,
    borderColor: 'divider',
    '&:hover': { bgcolor: 'background.paper' },
  }

  const navSx: SxProps<Theme> = {
    width: 48,
    height: 48,
    color: 'inherit',
    border: 1,
    borderColor: theme.material.outlineVariant,
    borderRadius: '12px',
  }

  const inlineSx: SxProps<Theme> = { width: 48, height: 48 }

  const row = variant === 'row'
  const ids = row
    ? { button: 'profile-language-button', menu: 'profile-language-menu' }
    : { button: 'customer-language-button', menu: 'customer-language-menu' }
  return (
    <>
      {row ? (
        <Button
          id={ids.button}
          aria-label={`${t.language}: ${currentLabel}`}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          aria-controls={open ? ids.menu : undefined}
          onClick={handleOpen}
          startIcon={<Globe size={20} />}
          sx={settingsRowSx}
        >
          {t.language}
          <Box component="span" sx={{ ml: 'auto', pl: 3, color: 'text.secondary' }}>
            {currentLabel}
          </Box>
        </Button>
      ) : (
        <HoverTip title={`${t.language}: ${currentLabel}`}>
          <IconButton
            id={ids.button}
            aria-label={`${t.language}: ${currentLabel}`}
            aria-haspopup="true"
            aria-expanded={open ? 'true' : undefined}
            aria-controls={open ? ids.menu : undefined}
            onClick={handleOpen}
            sx={{
              ...(variant === 'fixed' ? fixedSx : variant === 'inline' ? inlineSx : navSx),
              ...sx,
            }}
          >
            <Globe size={20} />
          </IconButton>
        </HoverTip>
      )}
      <Menu
        id={ids.menu}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: { maxHeight: 360, width: 240 },
          },
        }}
      >
        <MenuItem
          key="system"
          selected={preferences.language === 'system'}
          onClick={() => handleSelect('system')}
          sx={{ minHeight: 44 }}
        >
          {t.languageSystem} ({LOCALE_NAMES[systemLocale()]})
        </MenuItem>
        {LOCALES.map((code) => (
          <MenuItem
            key={code}
            selected={preferences.language === code}
            onClick={() => handleSelect(code)}
            lang={code}
            sx={{ minHeight: 44 }}
          >
            {LOCALE_NAMES[code]}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
