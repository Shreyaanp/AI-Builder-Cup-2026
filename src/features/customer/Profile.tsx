import { useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { History, UserRound } from 'lucide-react'
import { Sheet } from '../v1/Sheet'
import { useCustomer } from './account'
import type { Profile } from './types'
import { accountCopy as t } from './copy'
import { SignInButton } from './SignIn'
import { preferenceChips } from './preferences'
import type { PreferenceKey } from './preferences'

/** Fixed beside the appearance switch on Ask, Chats and Saved. */
export function ProfileButton() {
  const roles = useTheme().material
  const account = useCustomer()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip title={t.profileButton}>
        <IconButton
          aria-label={t.profileButton}
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
            right: 'calc(env(safe-area-inset-right, 0px) + 60px)',
            zIndex: 1200,
            width: 44,
            height: 44,
            p: 0,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            '&:hover': { bgcolor: 'background.paper' },
          }}
        >
          {account.status === 'signed-in' ? (
            <Avatar
              className="c-pop"
              sx={{
                width: 34,
                height: 34,
                fontSize: 16,
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
      </Tooltip>
      <ProfileSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const roles = useTheme().material
  const account = useCustomer()
  const [notice, setNotice] = useState('')
  const profile = account.profile
  const chips = preferenceChips(profile)
  async function remove(key: PreferenceKey) {
    if (!profile) return
    const reset = { vegetarian: false, halal: false, budget: null, language: '' }[key]
    try {
      account.setProfile(
        await account.api<Profile>('/api/v1/customer/preferences', {
          method: 'PUT',
          body: JSON.stringify({ ...profile.preferences, [key]: reset }),
        }),
      )
    } catch {
      /* The chip stays; nothing changed. */
    }
  }
  async function clearAll() {
    try {
      account.setProfile(
        await account.api<Profile>('/api/v1/customer/preferences', { method: 'DELETE' }),
      )
      setNotice(t.cleared)
    } catch {
      /* Unchanged. */
    }
  }
  return (
    <Sheet open={open} onClose={onClose} titleId="customer-profile-title" title={t.profile}>
      {account.status !== 'signed-in' ? (
        <Stack spacing={3}>
          <Typography variant="bodyLarge">{t.signInBody}</Typography>
          <SignInButton />
        </Stack>
      ) : (
        <Stack spacing={3}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Avatar sx={{ bgcolor: roles.primary, color: roles.onPrimary, fontWeight: 700 }}>
              {(account.name || '?').slice(0, 1).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="titleMedium" noWrap>
                {t.signedInAs.replace('{name}', account.name)}
              </Typography>
              <Typography variant="bodySmall" color="text.secondary">
                {t.followedCount(profile?.follows.length ?? 0)}
              </Typography>
            </Box>
          </Stack>
          <Divider />
          <Box>
            <Typography variant="titleSmall" component="h3">
              {t.preferences}
            </Typography>
            <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 0.5 }}>
              {t.preferencesBody}
            </Typography>
            {chips.length === 0 ? (
              <Typography variant="bodyMedium" sx={{ mt: 2 }}>
                {t.nothingRemembered}
              </Typography>
            ) : (
              <Stack component="ul" direction="row" sx={{ mt: 2, p: 0, gap: 1, flexWrap: 'wrap' }}>
                {chips.map((chip, index) => (
                  <li key={chip.key} style={{ listStyle: 'none' }}>
                    <Chip
                      label={chip.label}
                      className="c-rise"
                      style={{ ['--i' as string]: index }}
                      onDelete={() => void remove(chip.key)}
                      sx={{ bgcolor: roles.secondaryContainer, color: roles.onSecondaryContainer }}
                    />
                  </li>
                ))}
              </Stack>
            )}
          </Box>
          {(profile?.searches.length ?? 0) > 0 && (
            <Box>
              <Typography variant="titleSmall" component="h3">
                {t.recent}
              </Typography>
              <Stack component="ul" spacing={1} sx={{ mt: 1, p: 0 }}>
                {profile!.searches.slice(0, 5).map((search) => (
                  <Stack
                    component="li"
                    key={search.q}
                    direction="row"
                    spacing={1}
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
          <Box role="status">{notice && <Alert severity="success">{notice}</Alert>}</Box>
          <Button
            variant="outlined"
            onClick={() => void clearAll()}
            disabled={chips.length === 0 && !(profile?.searches.length ?? 0)}
          >
            {t.clear}
          </Button>
          <Button
            color="error"
            onClick={() => {
              void account.signOut()
              onClose()
            }}
          >
            {t.signOut}
          </Button>
        </Stack>
      )}
    </Sheet>
  )
}
