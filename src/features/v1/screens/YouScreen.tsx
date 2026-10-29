import { useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import {
  Avatar,
  Box,
  ButtonBase,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material'
import {
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  LogOut,
  MessageCircleQuestion,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { openOwnerFeature } from '../../owner-tools/entry'
import { useToolCopy } from '../../owner-tools/copy'
import { TrustCard } from '../../trust/TrustCard'
import { useIdentity } from '../../../auth/useIdentity'
import { installState, offerInstall, subscribeInstall } from '../../../app/pwa'
import { shape } from '../../../design/theme'
import type { ColorMode } from '../../../design/theme'
import { isLanguagePref, LOCALE_NAMES, LOCALES, systemLocale } from '../../../i18n/locales'
import { usePreferences, usePreferencesDispatch } from '../../../state/hooks'
import { SeeAgain } from '../../first-run/FirstRun'
import { TourMenuButton } from '../../tour/TourEntry'
import { Sheet } from '../Sheet'
import { ReminderSettings } from '../ReminderSettings'
import { useCopy } from '../strings'
import { useTabsCopy } from '../tabsCopy'
import { useWorkspace } from '../workspaceContext'

/** One rounded group of rows, with a small heading above it. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
  const roles = useTheme().material
  return (
    <Box component="section" aria-label={title}>
      {title && (
        <Typography
          component="h2"
          variant="titleSmall"
          color="text.secondary"
          sx={{ px: 1, mb: 1.5 }}
        >
          {title}
        </Typography>
      )}
      <Box
        sx={{
          bgcolor: roles.surfaceContainer,
          borderRadius: `${shape.lg}px`,
          overflow: 'hidden',
          '& > * + *': { borderTop: `1px solid ${roles.outlineVariant}` },
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

/** A tappable row: icon, label (and hint), trailing chevron or mark. */
function Row({
  icon,
  label,
  hint,
  trailing,
  onClick,
  current,
}: {
  icon: ReactNode
  label: string
  hint?: string
  trailing?: ReactNode
  onClick: () => void
  current?: boolean
}) {
  const roles = useTheme().material
  return (
    <ButtonBase
      onClick={onClick}
      aria-current={current ? 'true' : undefined}
      sx={{
        width: '100%',
        minHeight: 56,
        px: 3,
        py: 1.5,
        gap: 2,
        justifyContent: 'flex-start',
        textAlign: 'start',
        '&:hover': { bgcolor: roles.surfaceContainerHigh },
        '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: -3 },
      }}
    >
      <Box component="span" aria-hidden="true" sx={{ display: 'flex', color: roles.primary }}>
        {icon}
      </Box>
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        <Typography component="span" variant="bodyLarge" sx={{ display: 'block' }}>
          {label}
        </Typography>
        {hint && (
          <Typography
            component="span"
            variant="bodySmall"
            color="text.secondary"
            sx={{ display: 'block', overflowWrap: 'anywhere' }}
          >
            {hint}
          </Typography>
        )}
      </Box>
      {trailing ?? <ChevronRight size={18} aria-hidden="true" color={roles.onSurfaceVariant} />}
    </ButtonBase>
  )
}

/**
 * You: who you are, the optional "Verify it's you", settings (language, look, coach voice),
 * your shops, privacy and your data (a sub-page), help and sign out.
 */
export function YouScreen() {
  const t = useCopy()
  const tabs = useTabsCopy()
  const tools = useToolCopy()
  const ws = useWorkspace()
  const identity = useIdentity()
  const preferences = usePreferences()
  const dispatch = usePreferencesDispatch()
  const roles = useTheme().material
  // B36: share the banner's deferred prompt; dismissal only suppresses the banner.
  const installation = useSyncExternalStore(subscribeInstall, installState)
  const [installHelp, setInstallHelp] = useState(false)
  const installButton = useRef<HTMLDivElement>(null)
  const shop = ws.active

  return (
    <Box component="section" aria-label={tabs.navYou} sx={{ maxWidth: 640, mx: 'auto', pt: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, px: 1, mb: 4 }}>
        <Avatar
          aria-hidden="true"
          sx={{
            width: 56,
            height: 56,
            bgcolor: roles.primaryContainer,
            color: roles.onPrimaryContainer,
            typography: 'titleLarge',
          }}
        >
          {(shop?.fields.name || t.appName).trim().charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h1" variant="titleLarge" sx={{ overflowWrap: 'anywhere' }}>
            {shop?.fields.name || t.appName}
          </Typography>
          <Typography variant="bodyMedium" color="text.secondary">
            {[shop?.fields.category, tabs.shopCount(ws.businesses.length)]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        </Box>
      </Stack>

      <Stack spacing={4}>
        <TrustCard compact />

        <Group title={t.settings}>
          <ReminderSettings />
          <Box sx={{ px: 3, py: 2 }}>
            {/* Default follows the phone's language setting; owners can pin a language here. */}
            <TextField
              select
              fullWidth
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
          <Box sx={{ px: 3, py: 2 }}>
            <Typography id="look-label" variant="labelLarge" sx={{ display: 'block', mb: 1 }}>
              {tabs.look}
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={preferences.appearance}
              onChange={(_, value: ColorMode | null) =>
                value && dispatch({ type: 'appearance', appearance: value })
              }
              aria-labelledby="look-label"
              sx={{ '& .MuiToggleButton-root': { color: roles.onSurface, minHeight: 48 } }}
            >
              <ToggleButton value="system">{t.themeSystem}</ToggleButton>
              <ToggleButton value="light">{t.themeLight}</ToggleButton>
              <ToggleButton value="dark">{t.themeDark}</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2, px: 3, py: 1.5 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="labelLarge" sx={{ display: 'block' }}>
                {tabs.coachVoice}
              </Typography>
              <Typography id="read-aloud-label" variant="bodySmall" color="text.secondary">
                {t.readAloud}
              </Typography>
            </Box>
            <Switch
              sx={{ height: 48, py: '17px', '& .MuiSwitch-switchBase': { p: '14px' } }}
              checked={ws.speakReplies}
              onChange={(_, checked) => ws.setSpeakReplies(checked)}
              slotProps={{ input: { 'aria-label': t.readAloud } }}
            />
          </Stack>
        </Group>

        <Group title={tabs.yourShops}>
          {ws.businesses.map((item) => (
            <Row
              key={item.id}
              icon={<Box sx={{ width: 20 }}>{item.id === ws.activeId && <Check size={20} />}</Box>}
              label={item.fields.name}
              hint={item.fields.category || undefined}
              current={item.id === ws.activeId}
              trailing={<span />}
              onClick={() => ws.select(item.id)}
            />
          ))}
          <Row icon={<Plus size={20} />} label={t.newShop} onClick={ws.startNewShop} />
        </Group>

        <Group>
          <Row
            icon={<ShieldCheck size={20} />}
            label={tabs.privacyRow}
            hint={tabs.privacyHint}
            onClick={() => ws.go('privacy')}
          />
        </Group>

        <Group title={tabs.help}>
          {/* Every Help entry is a Row, so icons and labels share one edge (OB-71). */}
          <SeeAgain app="owner">
            {(open, label) => <Row icon={<CircleHelp size={20} />} label={label} onClick={open} />}
          </SeeAgain>
          <TourMenuButton onStart={() => undefined}>
            {(start, label) => <Row icon={<Sparkles size={20} />} label={label} onClick={start} />}
          </TourMenuButton>
          <Row
            icon={<MessageCircleQuestion size={20} />}
            label={tools.guideTitle}
            onClick={() => openOwnerFeature('guide')}
          />
          {installation !== 'installed' && (
            <Box ref={installButton}>
              <Row
                icon={<Download size={20} />}
                label={t.installApp}
                trailing={<span />}
                onClick={() => {
                  if (installation === 'prompt')
                    void offerInstall().catch(() => setInstallHelp(true))
                  else setInstallHelp(true)
                }}
              />
            </Box>
          )}
        </Group>

        {identity.mode === 'firebase' && (
          <Group>
            <Row
              icon={<LogOut size={20} />}
              label={t.signOut}
              trailing={<span />}
              onClick={() => void identity.signOut()}
            />
          </Group>
        )}
      </Stack>

      <Sheet
        open={installHelp}
        onClose={() => {
          setInstallHelp(false)
          installButton.current?.querySelector('button')?.focus()
        }}
        titleId="you-install-title"
        title={t.installApp}
        onEntered={() => {
          document
            .querySelector<HTMLButtonElement>('[aria-labelledby="you-install-title"] button')
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
