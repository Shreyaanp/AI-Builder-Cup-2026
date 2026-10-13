import { useState } from 'react'
import {
  Alert,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  Leaf,
  Moon,
  Sparkles,
  Store,
  Sun,
} from 'lucide-react'
import { BusinessCard } from '../features/business/BusinessCard'
import { InputDock } from '../features/coach/InputDock'
import { copy } from '../design/copy'
import { layout } from '../design/theme'
import {
  useBusiness,
  useBusinessDispatch,
  usePreferences,
  usePreferencesDispatch,
} from '../state/hooks'
import type { BusinessFields, Destination, Segment } from '../state/model'
import { useOnline } from '../hooks/useOnline'
import { AccountControl } from '../auth/AccountControl'
import { useIdentity } from '../auth/useIdentity'

type DialogState =
  | { kind: 'example' | 'voice' | 'connections' }
  | { kind: 'edit'; fields: BusinessFields }
  | { kind: 'review'; fields: BusinessFields; revision: number }
  | null
const fieldKeys: (keyof BusinessFields)[] = ['name', 'category', 'location', 'hours', 'phone']

export default function App() {
  const identity = useIdentity()
  const preferences = usePreferences()
  const preferenceDispatch = usePreferencesDispatch()
  const business = useBusiness()
  const businessDispatch = useBusinessDispatch()
  const activeTheme = useTheme()
  const roles = activeTheme.material
  const isLight = activeTheme.palette.mode === 'light'
  const online = useOnline()
  const t = copy[preferences.language]
  const [dialog, setDialog] = useState<DialogState>(null)
  const [notice, setNotice] = useState('')
  const navigation = [
    { value: 'coach', label: t.coach, Icon: Sparkles },
    { value: 'business', label: t.business, Icon: Store },
    { value: 'activity', label: t.activity, Icon: Activity },
  ] as const
  const openEdit = () => setDialog({ kind: 'edit', fields: { ...business.fields } })
  const openReview = () =>
    setDialog({ kind: 'review', fields: { ...business.fields }, revision: business.revision })
  const changeDestination = (destination: Destination) =>
    preferenceDispatch({ type: 'destination', destination })

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'absolute',
          top: -100,
          left: 16,
          zIndex: 1600,
          bgcolor: roles.surface,
          p: 4,
          '&:focus': { top: 16 },
        }}
      >
        Skip to content
      </Box>
      <Box
        component="header"
        sx={{
          width: '100%',
          maxWidth: layout.pageWidth,
          mx: 'auto',
          px: layout.edge,
          pt: 5,
          pb: 3,
        }}
      >
        <AccountControl />
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
            <Leaf size={28} color={roles.primary} aria-hidden="true" />
            <Typography
              component="span"
              sx={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-.06em' }}
            >
              oGoogle AI
            </Typography>
          </Stack>
          <Box
            component="nav"
            aria-label={t.navigation}
            sx={{ display: { xs: 'none', md: 'flex' }, gap: 2 }}
          >
            {navigation.map(({ value, label, Icon }) => (
              <Button
                key={value}
                startIcon={<Icon size={18} />}
                aria-current={preferences.destination === value ? 'page' : undefined}
                onClick={() => changeDestination(value)}
                sx={{
                  bgcolor:
                    preferences.destination === value ? roles.secondaryContainer : 'transparent',
                  color:
                    preferences.destination === value
                      ? roles.onSecondaryContainer
                      : roles.onSurfaceVariant,
                }}
              >
                {label}
              </Button>
            ))}
          </Box>
          <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel id="language-label">{t.language}</InputLabel>
              <Select
                labelId="language-label"
                label={t.language}
                value={preferences.language}
                onChange={(event) =>
                  preferenceDispatch({
                    type: 'language',
                    language: event.target.value === 'hi' ? 'hi' : 'en',
                  })
                }
                sx={{ minHeight: 48 }}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="hi">हिन्दी</MenuItem>
              </Select>
            </FormControl>
            <IconButton
              aria-label={isLight ? t.dark : t.light}
              onClick={() =>
                preferenceDispatch({ type: 'appearance', appearance: isLight ? 'dark' : 'light' })
              }
            >
              {isLight ? <Moon size={20} /> : <Sun size={20} />}
            </IconButton>
          </Stack>
        </Stack>
      </Box>
      <Box
        component="main"
        id="main"
        tabIndex={-1}
        sx={{
          width: '100%',
          maxWidth: layout.pageWidth,
          mx: 'auto',
          px: layout.edge,
          py: { xs: 3, md: 10 },
          flex: 1,
        }}
      >
        {!online && (
          <Alert severity="info" sx={{ mb: 4 }}>
            {t.offline}
          </Alert>
        )}
        {preferences.destination === 'coach' && (
          <>
            <Box sx={{ mb: { xs: 4, md: 9 }, maxWidth: 600 }}>
              <Typography
                variant="body2"
                sx={{
                  display: { xs: 'none', md: 'block' },
                  color: roles.primary,
                  fontWeight: 600,
                  letterSpacing: '.08em',
                  mb: 3,
                }}
              >
                {t.eyebrow}
              </Typography>
              <Typography component="h1" variant="h1">
                {t.greeting}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 3 }}>
                {t.subtitle}
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.05fr) minmax(0, 1fr)' },
                gap: { xs: 5, md: 8 },
                alignItems: 'start',
              }}
            >
              <Box sx={{ minWidth: 0, order: { xs: 2, md: 1 } }}>
                <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 4, mb: 5 }}>
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '16px',
                      bgcolor: roles.tertiaryContainer,
                      color: roles.onTertiaryContainer,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Sparkles size={22} strokeWidth={1.5} />
                  </Box>
                  <Box>
                    <Typography component="h2" variant="h2">
                      {business.fields.name ? t.nextStep : t.firstStep}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      {business.fields.name ? t.nextHint : t.startHint}
                    </Typography>
                  </Box>
                </Stack>
                {business.note && (
                  <Box
                    sx={{
                      p: 4,
                      mb: 4,
                      borderLeft: '3px solid',
                      borderColor: 'primary.main',
                      bgcolor: roles.surfaceContainerLow,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {t.note}
                    </Typography>
                    <Typography sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', mt: 1 }}>
                      {business.note}
                    </Typography>
                  </Box>
                )}
                <InputDock onVoice={() => setDialog({ kind: 'voice' })} onNotice={setNotice} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
                  {identity.mode === 'firebase' && identity.status === 'ready'
                    ? t.signedPrivate
                    : t.dataNotice}
                </Typography>
              </Box>
              <Box sx={{ order: { xs: 1, md: 2 }, minWidth: 0 }}>
                <BusinessCard
                  onEdit={openEdit}
                  onExample={() => setDialog({ kind: 'example' })}
                  onReview={openReview}
                />
              </Box>
            </Box>
          </>
        )}
        {preferences.destination === 'business' && (
          <Box sx={{ maxWidth: 700 }}>
            <Typography component="h1" variant="h1" sx={{ mb: 6 }}>
              {t.business}
            </Typography>
            <BusinessCard
              onEdit={openEdit}
              onExample={() => setDialog({ kind: 'example' })}
              onReview={openReview}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              {t.session}
            </Typography>
          </Box>
        )}
        {preferences.destination === 'activity' && (
          <Box sx={{ maxWidth: 700 }}>
            <Typography component="h1" variant="h1" sx={{ mb: 3 }}>
              {t.activity}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 6 }}>
              {t.activityHint}
            </Typography>
            {business.events.length ? (
              <Box component="ol" sx={{ m: 0, pl: 6 }}>
                {business.events.map((event, index) => (
                  <Box
                    component="li"
                    key={`${event}-${index}`}
                    sx={{ py: 3, overflowWrap: 'anywhere' }}
                  >
                    {event}
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography>{t.emptyActivity}</Typography>
            )}
            <Divider sx={{ my: 6 }} />
            <Typography component="h2" variant="h2">
              {t.coachIdea}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 3 }}>
              {t.coachDetail}
            </Typography>
          </Box>
        )}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: 2,
            justifyContent: 'space-between',
            mt: { xs: 6, md: 10 },
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {t.session}
          </Typography>
          <Button
            startIcon={<CircleHelp size={16} />}
            onClick={() => setDialog({ kind: 'connections' })}
          >
            {t.connectionStatus}
          </Button>
        </Stack>
      </Box>
      <Box
        component="nav"
        aria-label={t.navigation}
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'sticky',
          bottom: 0,
          bgcolor: roles.surface,
          borderTop: '1px solid',
          borderColor: 'divider',
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigation
          showLabels
          value={preferences.destination}
          onChange={(_event, destination: Destination) => changeDestination(destination)}
          sx={{ bgcolor: 'transparent', height: 72 }}
        >
          {navigation.map(({ value, label, Icon }) => (
            <BottomNavigationAction
              key={value}
              value={value}
              label={label}
              icon={<Icon size={22} />}
            />
          ))}
        </BottomNavigation>
      </Box>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} aria-labelledby="dialog-title">
        <DialogTitle id="dialog-title">
          {dialog?.kind === 'edit'
            ? t.edit
            : dialog?.kind === 'review'
              ? t.review
              : dialog?.kind === 'example'
                ? t.examples
                : dialog?.kind === 'voice'
                  ? t.voiceTitle
                  : t.integrations}
        </DialogTitle>
        <DialogContent>
          {dialog?.kind === 'edit' && (
            <Stack sx={{ gap: 5, pt: 3 }}>
              {fieldKeys.map((key) => (
                <TextField
                  key={key}
                  fullWidth
                  label={t[key]}
                  value={dialog.fields[key]}
                  slotProps={{ htmlInput: { maxLength: 180 } }}
                  onChange={(event) =>
                    setDialog({
                      ...dialog,
                      fields: { ...dialog.fields, [key]: event.target.value },
                    })
                  }
                />
              ))}
            </Stack>
          )}
          {dialog?.kind === 'review' && (
            <>
              <Typography color="text.secondary" sx={{ mb: 5 }}>
                {t.reviewBody}
              </Typography>
              <Box component="dl" sx={{ m: 0 }}>
                {fieldKeys.map((key) => (
                  <Box key={key} sx={{ mb: 4 }}>
                    <Typography component="dt" variant="body2" color="text.secondary">
                      {t[key]}
                    </Typography>
                    <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
                      {dialog.fields[key] || t.missing}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}
          {dialog?.kind === 'example' && (
            <Stack sx={{ gap: 3 }}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                {t.fictional}
              </Typography>
              {(['grocery', 'tea', 'bakery'] as Segment[]).map((segment) => (
                <Button
                  key={segment}
                  variant="outlined"
                  endIcon={<ArrowRight size={18} />}
                  onClick={() => {
                    businessDispatch({ type: 'example', segment })
                    setDialog(null)
                    setNotice(t.fictional)
                  }}
                >
                  {t[segment]}
                </Button>
              ))}
            </Stack>
          )}
          {dialog?.kind === 'voice' && <Typography>{t.voiceBody}</Typography>}
          {dialog?.kind === 'connections' && (
            <>
              <Alert severity="info" sx={{ mb: 4 }}>
                {t.connectionStatus}
              </Alert>
              <Typography sx={{ mb: 4 }}>{t.integrationBody}</Typography>
              <Button
                component="a"
                href="https://business.google.com/"
                target="_blank"
                rel="noreferrer"
                endIcon={<ArrowRight size={18} />}
              >
                Google Business Profile
              </Button>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 4, flexWrap: 'wrap', gap: 2 }}>
          <Button onClick={() => setDialog(null)}>{t.close}</Button>
          {dialog?.kind === 'edit' && (
            <Button
              variant="contained"
              onClick={() => {
                businessDispatch({
                  type: 'edit',
                  fields: Object.fromEntries(
                    Object.entries(dialog.fields).map(([key, value]) => [key, value.trim()]),
                  ) as BusinessFields,
                })
                setDialog(null)
              }}
            >
              {t.apply}
            </Button>
          )}
          {dialog?.kind === 'review' && (
            <Button
              variant="contained"
              startIcon={<Check size={18} />}
              onClick={() => {
                businessDispatch({ type: 'review', revision: dialog.revision })
                setDialog(null)
                setNotice(t.saved)
              }}
            >
              {t.confirm}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!notice}
        message={notice}
        autoHideDuration={7000}
        onClose={() => setNotice('')}
      />
    </Box>
  )
}
