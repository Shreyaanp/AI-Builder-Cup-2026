import { useState } from 'react'
import { Button, IconButton, Tooltip, useTheme } from '@mui/material'
import { Check, Plus } from 'lucide-react'
import { useCustomer } from './account'
import { accountCopy as t } from './copy'

/**
 * Follow a shop. Signed in: synced to the account. Signed out: kept on this device and moved into
 * the account at the next sign-in, so following never forces an account.
 */
export function FollowButton({
  id,
  name,
  variant = 'button',
}: {
  id: string
  name: string
  /** `icon`: a compact round toggle for cards. */
  variant?: 'button' | 'icon'
}) {
  const roles = useTheme().material
  const account = useCustomer()
  const following = account.follows.includes(id)
  const [busy, setBusy] = useState(false)
  const [changed, setChanged] = useState(0)
  const label = (following ? t.unfollowShop : t.followShop).replace('{shop}', name)
  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      await account.setFollow(id, !following)
      setChanged((n) => n + 1)
    } catch {
      /* Unchanged state stays visible. */
    } finally {
      setBusy(false)
    }
  }
  const icon = following ? (
    <Check key={`on-${changed}`} size={18} className={changed ? 'c-bounce' : undefined} />
  ) : (
    <Plus key={`off-${changed}`} size={18} />
  )
  if (variant === 'icon')
    return (
      <Tooltip title={label}>
        <IconButton
          aria-label={label}
          aria-pressed={following}
          onClick={() => void toggle()}
          sx={{
            width: 40,
            height: 40,
            bgcolor: following ? roles.primary : roles.surface,
            color: following ? roles.onPrimary : roles.onSurface,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            transition: 'background-color 200ms, color 200ms',
            '&:hover': { bgcolor: following ? roles.primary : roles.surface },
          }}
        >
          {icon}
        </IconButton>
      </Tooltip>
    )
  return (
    <Button
      aria-pressed={following}
      aria-label={label}
      variant={following ? 'contained' : 'outlined'}
      size="small"
      startIcon={icon}
      onClick={() => void toggle()}
      sx={{
        minHeight: 40,
        minWidth: 112,
        transition: 'background-color 200ms, color 200ms, border-color 200ms',
      }}
    >
      {following ? t.following : t.follow}
    </Button>
  )
}
