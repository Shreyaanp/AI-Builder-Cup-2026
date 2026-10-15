import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Divider,
  FormControlLabel,
  IconButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Popover,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  Check,
  ChevronDown,
  Download,
  Globe,
  Leaf,
  LogOut,
  MessageCircle,
  Plus,
  Settings,
  ShieldCheck,
  Store,
} from 'lucide-react'
import { useIdentity } from '../../auth/useIdentity'
import { usePreferences, usePreferencesDispatch } from '../../state/hooks'
import { shape, windowClass } from '../../design/theme'
import type { ColorMode } from '../../design/theme'
import { useCopy } from './strings'
import { isLanguagePref, LOCALE_NAMES, LOCALES, systemLocale } from '../../i18n/locales'
import { useWorkspace } from './workspaceContext'
import type { Destination } from './workspaceContext'
import { CoachWorkspace } from './screens/CoachScreen'
import { TourHost, TourMenuButton } from '../tour/Tour'
import { ShopScreen } from './screens/ShopScreen'
import { ShopOverview } from './ShopTiles'
import { GoogleScreen } from './screens/GoogleScreen'
import { PrivacyScreen } from './screens/PrivacyScreen'
import { DiscardPrompt } from './DiscardPrompt'
import { Sheet } from './Sheet'
import { installState, offerInstall, subscribeInstall } from '../../app/pwa'

export function AppShell() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const rail = useMediaQuery(`(min-width:${windowClass.medium}px)`)
  const keyboard = useKeyboardOpen()
  const showNavBar = !rail && !keyboard
  // Large windows: My shop tiles beside the coach (phones keep the coach to one card).
  const supporting = useMediaQuery(`(min-width:${windowClass.large}px)`)
  useEffect(() => {
    document.documentElement.style.setProperty('--nav-offset', showNavBar ? '84px' : '0px')
  }, [showNavBar])
  const destinations: { id: Destination; label: string; icon: ReactNode }[] = [
    { id: 'coach', label: t.navCoach, icon: <MessageCircle size={22} /> },
    { id: 'shop', label: t.navShop, icon: <Store size={22} /> },
    { id: 'google', label: t.navGoogle, icon: <Globe size={22} /> },
    { id: 'privacy', label: t.navPrivacy, icon: <ShieldCheck size={22} /> },
  ]
  const screen =
    ws.destination === 'coach'
      ? null
      : { shop: <ShopScreen />, google: <GoogleScreen />, privacy: <PrivacyScreen /> }[
          ws.destination
        ]

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: roles.surface }}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {rail && (
        <Box
          component="nav"
          aria-label="Main"
          sx={{
            width: 96,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            pt: 'calc(16px + env(safe-area-inset-top))',
            pl: 'env(safe-area-inset-left)',
          }}
        >
          <Box aria-hidden="true" sx={{ color: roles.primary, mb: 3, mt: 1 }}>
            <Leaf size={28} />
          </Box>
          {destinations.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              selected={ws.destination === item.id}
              onSelect={ws.go}
              rail
            />
          ))}
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <TourHost />
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Box
            component="main"
            id="main"
            tabIndex={-1}
            sx={{
              flex: 1,
              minWidth: 0,
              px: { xs: 2, sm: 3, md: 4 },
              pb: rail ? 3 : 'calc(96px + env(safe-area-inset-bottom))',
              outline: 'none',
            }}
          >
            {/* Coach stays mounted while hidden so drafts, replies and voice survive tab
                changes; keyed by shop so each shop has its own thread. */}
            <Box hidden={ws.destination !== 'coach'} sx={{ height: '100%' }}>
              <CoachWorkspace />
            </Box>
            {screen}
          </Box>
          {supporting && ws.destination === 'coach' && ws.active && (
            <Box
              component="aside"
              aria-label={t.navShop}
              sx={{
                width: 400,
                flexShrink: 0,
                m: 4,
                ml: 0,
                alignSelf: 'flex-start',
                position: 'sticky',
                top: 80,
                maxHeight: 'calc(100dvh - 96px)',
                overflowY: 'auto',
              }}
            >
              <ShopOverview key={ws.active.id} narrow />
            </Box>
          )}
        </Box>
      </Box>
      {showNavBar && (
        <Box
          component="nav"
          aria-label="Main"
          sx={{
            position: 'fixed',
            insetInline: 0,
            bottom: 0,
            zIndex: 10,
            display: 'grid',
            gridTemplateColumns: `repeat(${destinations.length}, 1fr)`,
            bgcolor: roles.surfaceContainer,
            pt: 1.5,
            pb: 'calc(16px + env(safe-area-inset-bottom))',
            px: 'env(safe-area-inset-left)',
          }}
        >
          {destinations.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              selected={ws.destination === item.id}
              onSelect={ws.go}
            />
          ))}
        </Box>
      )}
      <DiscardPrompt />
    </Box>
  )
}

/**
 * True while the on-screen keyboard is up, so the bottom navigation can make room for the
 * composer. Focus alone is not enough: a field keeps focus after the owner dismisses the
 * keyboard (or after "Something changed" focuses the composer), which left the navigation
 * hidden for good (B2). The page uses interactive-widget=resizes-content, so the keyboard
 * shows up as the window getting clearly shorter than its full height at the same width.
 */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let width = window.innerWidth
    let full = window.innerHeight
    const isText = (node: Element | null) =>
      node instanceof HTMLTextAreaElement ||
      (node instanceof HTMLInputElement && !['checkbox', 'radio', 'file'].includes(node.type))
    const update = () => {
      const height = window.visualViewport?.height ?? window.innerHeight
      if (window.innerWidth !== width) {
        // Rotation or a resized window: start measuring again.
        width = window.innerWidth
        full = height
      }
      full = Math.max(full, height)
      setOpen(isText(document.activeElement) && full - height > 120)
    }
    // Focus moves before the keyboard animates; resize events report the result.
    const later = () => window.setTimeout(update, 0)
    window.visualViewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    document.addEventListener('focusin', later)
    document.addEventListener('focusout', later)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
      document.removeEventListener('focusin', later)
      document.removeEventListener('focusout', later)
    }
  }, [])
  return open
}

function NavItem({
  item,
  selected,
  onSelect,
  rail = false,
}: {
  item: { id: Destination; label: string; icon: ReactNode }
  selected: boolean
  onSelect: (id: Destination) => void
  rail?: boolean
}) {
  const roles = useTheme().material
  return (
    <ButtonBase
      aria-current={selected ? 'page' : undefined}
      data-tour={`nav-${item.id}`}
      onClick={() => onSelect(item.id)}
      sx={{
        flexDirection: 'column',
        gap: 0.5,
        minWidth: rail ? 80 : 64,
        minHeight: 56,
        borderRadius: `${shape.lg}px`,
        color: selected ? roles.onSurface : roles.onSurfaceVariant,
        '&:focus-visible': { outline: `3px solid ${roles.primary}` },
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 32,
          borderRadius: `${shape.full}px`,
          display: 'grid',
          placeItems: 'center',
          bgcolor: selected ? roles.secondaryContainer : 'transparent',
          color: selected ? roles.onSecondaryContainer : 'inherit',
          transition: 'background-color 200ms ease',
        }}
      >
        {item.icon}
      </Box>
      <Typography
        variant="labelMedium"
        sx={{
          fontWeight: selected ? 700 : 500,
          lineHeight: 1.8,
          py: 0.5,
          'html[lang="ta"] &': { fontFamily: '"Noto Sans Tamil", sans-serif' },
        }}
      >
        {item.label}
      </Typography>
    </ButtonBase>
  )
}

function TopBar() {
  const t = useCopy()
  const ws = useWorkspace()
  const identity = useIdentity()
  const preferences = usePreferences()
  const dispatch = usePreferencesDispatch()
  const roles = useTheme().material
  const [shopMenu, setShopMenu] = useState<HTMLElement | null>(null)
  const [settings, setSettings] = useState<HTMLElement | null>(null)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  // B36: share the banner's deferred prompt; dismissal only suppresses the banner.
  const installation = useSyncExternalStore(subscribeInstall, installState)
  const [installHelp, setInstallHelp] = useState(false)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const returnInstallFocus = useRef(false)
  useEffect(() => {
    if (!installHelp && returnInstallFocus.current) {
      settingsButton.current?.focus()
      returnInstallFocus.current = false
    }
  }, [installHelp])
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        bgcolor: roles.surface,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minHeight: 64,
        px: { xs: 1, sm: 2 },
        pt: 'env(safe-area-inset-top)',
      }}
    >
      <Button
        onClick={(event) => setShopMenu(event.currentTarget)}
        endIcon={<ChevronDown size={18} />}
        aria-haspopup="menu"
        aria-label={t.chooseShop + (ws.active ? `: ${ws.active.fields.name}` : '')}
        sx={{ color: roles.onSurface, minWidth: 0, maxWidth: 'min(70vw, 420px)', px: 1.5 }}
      >
        <Typography variant="titleLarge" noWrap component="span">
          {ws.active?.fields.name ?? t.appName}
        </Typography>
      </Button>
      <Box sx={{ flex: 1 }} />
      {/* New chat and the other coach actions, next to settings (only where the coach is). */}
      {ws.destination === 'coach' && (
        <Tooltip title={t.newChat}>
          <IconButton
            aria-label={t.newChat}
            aria-haspopup="dialog"
            onClick={() => ws.setCoachActions(true)}
          >
            <Plus size={22} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={t.settings}>
        <IconButton
          ref={settingsButton}
          aria-label={t.settings}
          aria-haspopup="dialog"
          aria-expanded={Boolean(settings)}
          aria-controls={settings ? 'settings-panel' : undefined}
          onClick={(event) => setSettings(event.currentTarget)}
        >
          <Settings size={22} />
        </IconButton>
      </Tooltip>

      <Menu anchorEl={shopMenu} open={Boolean(shopMenu)} onClose={() => setShopMenu(null)}>
        {ws.businesses.length === 0 && (
          <MenuItem disabled>
            <ListItemText primary={t.noShop} />
          </MenuItem>
        )}
        {ws.businesses.map((shop) => (
          <MenuItem
            key={shop.id}
            selected={shop.id === ws.activeId}
            onClick={() => {
              ws.select(shop.id)
              setShopMenu(null)
            }}
          >
            <ListItemIcon>{shop.id === ws.activeId ? <Check size={18} /> : null}</ListItemIcon>
            <ListItemText primary={shop.fields.name} secondary={shop.fields.category || null} />
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={() => {
            setShopMenu(null)
            ws.openEditor({ kind: 'business', fields: null })
          }}
        >
          <ListItemIcon>
            <Plus size={18} />
          </ListItemIcon>
          <ListItemText primary={t.newShop} />
        </MenuItem>
      </Menu>

      <Popover
        anchorEl={settings}
        transitionDuration={reducedMotion ? 0 : undefined}
        open={Boolean(settings)}
        onClose={() => setSettings(null)}
        disableRestoreFocus={installHelp}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            id: 'settings-panel',
            role: 'dialog',
            'aria-modal': true,
            'aria-label': t.settings,
            sx: { py: 1, maxWidth: 'calc(100vw - 32px)' },
          },
        }}
      >
        <ListSubheader component="div" sx={{ bgcolor: 'transparent', lineHeight: '36px' }}>
          {t.language}
        </ListSubheader>
        <Box sx={{ px: 2, pb: 1, minWidth: 240 }}>
          {/* Default follows the phone's language setting; owners can pin a language here. */}
          <TextField
            select
            fullWidth
            size="small"
            label={t.language}
            value={preferences.language}
            onChange={(event) =>
              isLanguagePref(event.target.value) &&
              dispatch({ type: 'language', language: event.target.value })
            }
          >
            <MenuItem value="system">
              {t.languageSystem} ({LOCALE_NAMES[systemLocale()]})
            </MenuItem>
            {LOCALES.map((code) => (
              <MenuItem key={code} value={code} lang={code}>
                {LOCALE_NAMES[code]}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <ListSubheader component="div" sx={{ bgcolor: 'transparent', lineHeight: '36px' }}>
          {t.theme}
        </ListSubheader>
        <Box sx={{ px: 2, pb: 1 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={preferences.appearance}
            onChange={(_, value: ColorMode | null) =>
              value && dispatch({ type: 'appearance', appearance: value })
            }
            aria-label={t.theme}
            sx={{ '& .MuiToggleButton-root': { color: roles.onSurface, minHeight: 48 } }}
          >
            <ToggleButton value="system">{t.themeSystem}</ToggleButton>
            <ToggleButton value="light">{t.themeLight}</ToggleButton>
            <ToggleButton value="dark">{t.themeDark}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ px: 2 }}>
          <FormControlLabel
            label={t.readAloud}
            labelPlacement="start"
            sx={{ m: 0, minHeight: 48, width: '100%', justifyContent: 'space-between' }}
            control={
              <Switch
                checked={ws.speakReplies}
                onChange={(_, checked) => ws.setSpeakReplies(checked)}
              />
            }
          />
        </Box>
        <TourMenuButton onStart={() => setSettings(null)} />
        {installation !== 'installed' && (
          <ButtonBase
            sx={{
              minHeight: 48,
              width: '100%',
              px: 2,
              textAlign: 'left',
              justifyContent: 'flex-start',
              '&:hover': { bgcolor: roles.surfaceContainerHigh },
              '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: -3 },
            }}
            onClick={() => {
              setSettings(null)
              if (installation === 'prompt') {
                void offerInstall().catch(() => {
                  returnInstallFocus.current = true
                  setInstallHelp(true)
                })
              } else {
                returnInstallFocus.current = true
                setInstallHelp(true)
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Download size={18} />
            </ListItemIcon>
            <ListItemText primary={t.installApp} />
          </ButtonBase>
        )}
        {identity.mode === 'firebase' && [
          <Divider key="divider" />,
          <ButtonBase
            key="signout"
            sx={{
              width: '100%',
              minHeight: 48,
              px: 2,
              textAlign: 'left',
              justifyContent: 'flex-start',
              '&:hover': { bgcolor: roles.surfaceContainerHigh },
              '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: -3 },
            }}
            onClick={() => {
              setSettings(null)
              void identity.signOut()
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <LogOut size={18} />
            </ListItemIcon>
            <ListItemText primary={t.signOut} />
          </ButtonBase>,
        ]}
        <Typography
          variant="bodySmall"
          color="text.secondary"
          sx={{ display: 'block', px: 2, pt: 1, pb: 0.5, maxWidth: 280 }}
        >
          {t.independent}
        </Typography>
      </Popover>
      <Sheet
        open={installHelp}
        onClose={() => setInstallHelp(false)}
        titleId="settings-install-title"
        title={t.installApp}
        onEntered={() => {
          document
            .querySelector<HTMLButtonElement>('[aria-labelledby="settings-install-title"] button')
            ?.focus()
        }}
      >
        <Typography variant="bodyLarge">
          {installation === 'ios' ? t.installIos : t.installUnavailable}
        </Typography>
      </Sheet>
    </Box>
  )
}
