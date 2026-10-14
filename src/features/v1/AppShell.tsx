import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
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
import { CoachScreen } from './screens/CoachScreen'
import { ShopScreen, ShopSummary } from './screens/ShopScreen'
import { GoogleScreen } from './screens/GoogleScreen'
import { PrivacyScreen } from './screens/PrivacyScreen'

export function AppShell() {
  const t = useCopy()
  const ws = useWorkspace()
  const roles = useTheme().material
  const rail = useMediaQuery(`(min-width:${windowClass.medium}px)`)
  // While the on-screen keyboard is up (a text field is focused on a phone), hide the bottom
  // navigation so the composer sits directly on the keyboard.
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const isText = (node: EventTarget | null) =>
      node instanceof HTMLTextAreaElement ||
      (node instanceof HTMLInputElement && !['checkbox', 'radio', 'file'].includes(node.type))
    const onIn = (event: FocusEvent) => setTyping(isText(event.target))
    const onOut = () => setTyping(false)
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  const showNavBar = !rail && !typing
  useEffect(() => {
    document.documentElement.style.setProperty('--nav-offset', showNavBar ? '84px' : '0px')
  }, [showNavBar])
  const supporting = useMediaQuery(`(min-width:${windowClass.large}px)`)
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
  const showPane = supporting && ws.destination === 'coach' && ws.active

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
              <CoachScreen key={ws.activeId ?? 'no-shop'} />
            </Box>
            {screen}
          </Box>
          {showPane && (
            <Box
              component="aside"
              aria-label={t.navShop}
              sx={{
                width: 380,
                flexShrink: 0,
                m: 2,
                ml: 0,
                p: 3,
                borderRadius: `${shape.xl}px`,
                bgcolor: roles.surfaceContainer,
                alignSelf: 'flex-start',
                position: 'sticky',
                top: 80,
                maxHeight: 'calc(100dvh - 96px)',
                overflowY: 'auto',
              }}
            >
              <ShopSummary compact />
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
    </Box>
  )
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
      <Typography variant="labelMedium" sx={{ fontWeight: selected ? 700 : 500 }}>
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
      <Tooltip title={t.settings}>
        <IconButton
          aria-label={t.settings}
          aria-haspopup="menu"
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

      <Menu anchorEl={settings} open={Boolean(settings)} onClose={() => setSettings(null)}>
        <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: '36px' }}>
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
        <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: '36px' }}>{t.theme}</ListSubheader>
        <Box sx={{ px: 2, pb: 1 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={preferences.appearance}
            onChange={(_, value: ColorMode | null) =>
              value && dispatch({ type: 'appearance', appearance: value })
            }
            aria-label={t.theme}
          >
            <ToggleButton value="system">{t.themeSystem}</ToggleButton>
            <ToggleButton value="light">{t.themeLight}</ToggleButton>
            <ToggleButton value="dark">{t.themeDark}</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <MenuItem onClick={() => ws.setSpeakReplies(!ws.speakReplies)}>
          <ListItemText primary={t.readAloud} />
          <Switch
            edge="end"
            checked={ws.speakReplies}
            tabIndex={-1}
            slotProps={{ input: { 'aria-label': t.readAloud } }}
          />
        </MenuItem>
        {identity.mode === 'firebase' && [
          <Divider key="divider" />,
          <MenuItem
            key="signout"
            onClick={() => {
              setSettings(null)
              void identity.signOut()
            }}
          >
            <ListItemIcon>
              <LogOut size={18} />
            </ListItemIcon>
            <ListItemText primary={t.signOut} />
          </MenuItem>,
        ]}
        <Typography
          variant="bodySmall"
          color="text.secondary"
          sx={{ display: 'block', px: 2, pt: 1, pb: 0.5, maxWidth: 280 }}
        >
          {t.independent}
        </Typography>
      </Menu>
    </Box>
  )
}
