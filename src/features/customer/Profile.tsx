import { useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { SeeAgain } from '../first-run/FirstRun'
import { Eraser, History, LogOut, Trash2, UserRound } from 'lucide-react'
import { Sheet } from '../v1/Sheet'
import { useTabsCopy } from '../v1/tabsCopy'
import { HoverTip } from '../frontdoors/HoverTip'
import { AppearanceToggle } from '../frontdoors/AppearanceToggle'
import { LanguagePicker } from '../frontdoors/LanguagePicker'
import { settingsRowSx } from '../frontdoors/settingsRow'
import { useCustomer } from './account'
import { useGuestCopy } from './guestCopy'
import type { Profile } from './types'
import { useLocale } from '../../state/hooks'
import { useAccountCopy } from './copy'
import { SignInButton } from './SignIn'
import { preferenceChips } from './preferences'
import { forgetOpened } from '../discover/opened'
import { forgetKeptPassport } from './offline'
import { clearReceipts, refreshPassport } from '../passport/store'
import { clearRewards } from '../rewards/storage'
import type { PreferenceKey } from './preferences'
import { samplePrice } from '../discover/conversationCopy'
import { areaCurrency } from '../v1/format'

/** Fixed beside the appearance switch on Ask, Chats and Saved. */
/** `inline` sits in a page's own header row instead of floating top-right. */
export function ProfileButton({ inline = false }: { inline?: boolean }) {
  const roles = useTheme().material
  const account = useCustomer()
  const t = useAccountCopy()
  const [open, setOpen] = useState(false)
  return (
    <>
      <HoverTip title={t.profileButton}>
        <IconButton
          aria-label={t.profileButton}
          onClick={() => setOpen(true)}
          sx={
            inline
              ? { width: 48, height: 48, p: 0 }
              : {
                  position: 'fixed',
                  top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
                  right: 'calc(env(safe-area-inset-right, 0px) + 120px)',
                  zIndex: 1200,
                  width: 48,
                  height: 48,
                  p: 0,
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'background.paper' },
                }
          }
        >
          {account.status === 'signed-in' ? (
            <Avatar
              className="c-pop"
              sx={{
                width: 34,
                height: 34,
                // The body size (16px, 15px on phones), so the initial adds no extra size to a screen.
                typography: 'body1',
                fontWeight: 700,
                bgcolor: roles.primary,
                color: roles.onPrimary,
              }}
            >
              {(account.name || '?').slice(0, 1).toUpperCase()}
            </Avatar>
          ) : (
            <UserRound size={20} />
          )}
        </IconButton>
      </HoverTip>
      <ProfileSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** The area Ask last searched (shared with Ask, Rescue and Passport), for its currency. */
function askedArea(): { lat: number; lng: number } | null {
  try {
    const place = (
      JSON.parse(localStorage.getItem('chalkboard.discover.filters') || '{}') as {
        place?: { lat: number; lng: number }
      }
    ).place
    return place && Number.isFinite(place.lat) && Number.isFinite(place.lng) ? place : null
  } catch {
    return null
  }
}

/**
 * The profile sheet (A-21): who you are, then one list of 48px rows on one left edge: language,
 * look, what is remembered and how to clear it, help, sign out. Close is the sheet's own.
 */
export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const roles = useTheme().material
  const account = useCustomer()
  const guest = useGuestCopy()
  const t = useAccountCopy()
  const tabs = useTabsCopy()
  const locale = useLocale()
  // A deletion the server refused is said out loud, with a way to try it again.
  const [notice, setNotice] = useState<{
    kind: 'success' | 'error'
    text: string
    retry?: () => void
  } | null>(null)
  const [clearing, setClearing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const profile = account.profile
  const identified = account.status === 'signed-in' || account.status === 'guest'
  const chips = preferenceChips(profile, t, locale)
  async function remove(key: PreferenceKey, label: string) {
    if (!profile) return
    const reset = { vegetarian: false, halal: false, budget: null, language: '' }[key]
    setNotice(null)
    try {
      account.setProfile(
        await account.api<Profile>('/api/v1/customer/preferences', {
          method: 'PUT',
          body: JSON.stringify({ ...profile.preferences, [key]: reset }),
        }),
      )
    } catch {
      setNotice({
        kind: 'error',
        text: t.removeFailed.replace('{item}', label),
        retry: () => void remove(key, label),
      })
    }
  }
  async function clearAll() {
    if (clearing) return
    setClearing(true)
    setNotice(null)
    try {
      account.setProfile(
        await account.api<Profile>('/api/v1/customer/preferences', { method: 'DELETE' }),
      )
      // Shops opened on this phone are a personal signal too.
      forgetOpened()
      setNotice({ kind: 'success', text: t.cleared })
    } catch {
      setNotice({ kind: 'error', text: t.clearFailed, retry: () => void clearAll() })
    } finally {
      setClearing(false)
    }
  }
  /**
   * OB-96 "Delete my data": with an account, everything the server keeps for it (chats and the
   * shops' copies, passport, tips, follows, preferences, searches) and then a sign-out; on this
   * phone, the stamps and follows it kept.
   */
  async function deleteMine() {
    if (clearing) return
    setClearing(true)
    setNotice(null)
    try {
      if (identified) {
        const result = await account.api<{ status: 'erased' | 'partial' }>(
          '/api/v1/customer/data',
          { method: 'DELETE' },
        )
        if (result.status !== 'erased') throw new Error('partial')
      } else {
        for (const id of [...account.follows]) await account.setFollow(id, false)
      }
      clearReceipts()
      clearRewards()
      forgetKeptPassport()
      forgetOpened()
      refreshPassport()
      setConfirming(false)
      if (identified) {
        // Clears the rest of this phone's customer data and says so on Ask, also when the
        // sign-out itself fails (OB-96 review: the phone must not keep the session silently).
        await account.signOut('data-deleted', { orIfItFails: 'data-deleted-signed-in' })
        return
      }
      setNotice({ kind: 'success', text: t.deleteDataDone })
    } catch {
      setNotice({ kind: 'error', text: t.deleteDataFailed, retry: () => void deleteMine() })
    } finally {
      setClearing(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} titleId="customer-profile-title" title={t.profile}>
      <Stack spacing={3}>
        {!identified ? (
          <Stack spacing={3}>
            <Typography variant="bodyMedium" color="text.secondary">
              {t.signInBody}
            </Typography>
            <SignInButton />
          </Stack>
        ) : (
          <Stack spacing={1}>
            <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
              <Avatar sx={{ bgcolor: roles.primary, color: roles.onPrimary, fontWeight: 700 }}>
                {(account.name || '?').slice(0, 1).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="titleMedium" noWrap>
                  {account.status === 'guest'
                    ? account.name
                    : t.signedInAs.replace('{name}', account.name)}
                </Typography>
                <Typography variant="bodySmall" color="text.secondary">
                  {t.followedCount(profile?.follows.length ?? 0)}
                </Typography>
              </Box>
            </Stack>
            {account.status === 'guest' && (
              <Typography variant="bodySmall" color="text.secondary">
                {guest.privacy}
              </Typography>
            )}
          </Stack>
        )}
        <Divider />
        <Stack>
          <LanguagePicker variant="row" />
          <AppearanceToggle row />
        </Stack>
        <Divider />
        <Stack spacing={1}>
          {identified && (
            <Box>
              <Typography variant="titleSmall" component="h3">
                {t.preferences}
              </Typography>
              <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
                {/* The budget example is in the area's own money: S$ in Tiong Bahru (OB-148). */}
                {t.preferencesBody.replace(
                  '{price}',
                  samplePrice(areaCurrency(askedArea()), locale),
                )}
              </Typography>
              {chips.length === 0 ? (
                <Typography variant="bodyMedium" sx={{ mt: 2 }}>
                  {t.nothingRemembered}
                </Typography>
              ) : (
                <Stack
                  component="ul"
                  direction="row"
                  sx={{ mt: 2, p: 0, mb: 0, gap: 2, flexWrap: 'wrap' }}
                >
                  {chips.map((chip, index) => (
                    <li key={chip.key} style={{ listStyle: 'none' }}>
                      <Chip
                        label={chip.label}
                        className="c-rise"
                        style={{ ['--i' as string]: index }}
                        onDelete={() => void remove(chip.key, chip.label)}
                        sx={{
                          bgcolor: roles.secondaryContainer,
                          color: roles.onSecondaryContainer,
                        }}
                      />
                    </li>
                  ))}
                </Stack>
              )}
            </Box>
          )}
          {identified && (profile?.searches?.length ?? 0) > 0 && (
            <Box>
              <Typography variant="titleSmall" component="h3" sx={{ mt: 2 }}>
                {t.recent}
              </Typography>
              <Stack component="ul" spacing={1} sx={{ mt: 1, p: 0 }}>
                {profile!.searches.slice(0, 5).map((search) => (
                  <Stack
                    component="li"
                    key={search.q}
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center', color: 'text.secondary', listStyle: 'none' }}
                  >
                    <History size={16} aria-hidden="true" />
                    <Typography variant="bodyMedium" noWrap>
                      {search.q}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
          <Box role="status">
            {notice?.kind === 'success' && <Alert severity="success">{notice.text}</Alert>}
          </Box>
          {notice?.kind === 'error' && (
            <Alert
              severity="error"
              role="alert"
              action={
                notice.retry && (
                  <Button color="inherit" size="small" onClick={notice.retry}>
                    {t.retry}
                  </Button>
                )
              }
            >
              {notice.text}
            </Alert>
          )}
          {identified && (
            <Button
              onClick={() => void clearAll()}
              disabled={clearing || (chips.length === 0 && !(profile?.searches.length ?? 0))}
              startIcon={
                clearing ? <CircularProgress size={20} color="inherit" /> : <Eraser size={20} />
              }
              sx={settingsRowSx}
            >
              {clearing ? t.clearing : t.clear}
            </Button>
          )}
          <Button
            onClick={() => setConfirming(true)}
            disabled={clearing || confirming}
            startIcon={<Trash2 size={20} />}
            sx={settingsRowSx}
          >
            {t.deleteData}
          </Button>
          {confirming && (
            <Alert severity="warning" role="group" aria-label={t.deleteData}>
              <Typography variant="bodyMedium">
                {identified ? t.deleteDataBody : t.deleteDataDeviceBody}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="error"
                  disabled={clearing}
                  onClick={() => void deleteMine()}
                >
                  {t.deleteDataDo}
                </Button>
                <Button disabled={clearing} onClick={() => setConfirming(false)}>
                  {t.notNow}
                </Button>
              </Stack>
            </Alert>
          )}
        </Stack>
        <Divider />
        {/* Help comes after the account: signing in stays the first thing in the sheet. */}
        <Box component="section" aria-label={tabs.help}>
          <Typography component="h2" variant="titleSmall" sx={{ mb: 1 }}>
            {tabs.help}
          </Typography>
          <SeeAgain app="customer" row />
        </Box>
        {account.status === 'signed-in' && (
          <Button
            startIcon={<LogOut size={20} />}
            onClick={() => {
              void account.signOut()
              onClose()
            }}
            sx={settingsRowSx}
          >
            {t.signOut}
          </Button>
        )}
      </Stack>
    </Sheet>
  )
}
