import { Box, Typography, useTheme } from '@mui/material'
import { Bookmark, MessageCircle, Sparkles, Stamp } from 'lucide-react'
import { customerNavigate } from '../frontdoors/navigation'
import { useCustomer } from './account'
import { useAccountCopy } from './copy'
import { usePassportCopy } from '../passport/copy'
import './customer.css'

export type CustomerTab = 'ask' | 'passport' | 'chats' | 'saved'

const tabs: { id: CustomerTab; href: string; Icon: typeof Sparkles }[] = [
  { id: 'ask', href: '/explore/', Icon: Sparkles },
  { id: 'passport', href: '/explore/passport', Icon: Stamp },
  { id: 'chats', href: '/explore/chats', Icon: MessageCircle },
  { id: 'saved', href: '/explore/saved', Icon: Bookmark },
]

/** M3 navigation bar: three top-level customer destinations, unread badge on Chats. */
export function CustomerNav({ active }: { active: CustomerTab }) {
  const roles = useTheme().material
  const { unread } = useCustomer()
  const t = useAccountCopy()
  const passport = usePassportCopy()
  return (
    <Box
      component="nav"
      aria-label={t.nav}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1100,
        bgcolor: roles.surfaceContainer,
        borderTop: `1px solid ${roles.outlineVariant}`,
        pb: 'env(safe-area-inset-bottom)',
        // Above the page, but never over an open sheet's scrim.
        viewTransitionName: 'customer-nav',
      }}
    >
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          mx: 'auto',
          maxWidth: 560,
          display: 'grid',
          gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
          height: 80,
        }}
      >
        {tabs.map(({ id, href, Icon }) => {
          const label = id === 'passport' ? passport.nav : t[id]
          const current = id === active
          const badge = id === 'chats' && unread > 0
          return (
            <li key={id} style={{ display: 'flex' }}>
              <Box
                component="a"
                href={href}
                onClick={customerNavigate}
                aria-current={current ? 'page' : undefined}
                aria-label={badge ? `${label}, ${t.unread(unread)}` : undefined}
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  color: current ? roles.onSurface : roles.onSurfaceVariant,
                  textDecoration: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  '&:focus-visible': { outline: `3px solid ${roles.primary}`, outlineOffset: -6 },
                }}
              >
                <Box sx={{ position: 'relative', width: 64, height: 32, display: 'grid' }}>
                  <Box
                    aria-hidden="true"
                    className="c-indicator"
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 999,
                      bgcolor: roles.secondaryContainer,
                    }}
                  />
                  <Box
                    sx={{
                      position: 'relative',
                      placeSelf: 'center',
                      display: 'grid',
                      color: current ? roles.onSecondaryContainer : 'inherit',
                    }}
                  >
                    <Icon size={22} strokeWidth={current ? 2.4 : 2} aria-hidden="true" />
                  </Box>
                  {badge && (
                    <Box
                      key={unread}
                      aria-hidden="true"
                      className="c-pop"
                      sx={{
                        position: 'absolute',
                        top: -2,
                        left: 36,
                        minWidth: 18,
                        height: 18,
                        px: 0.5,
                        borderRadius: 999,
                        bgcolor: roles.error,
                        color: roles.onError,
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {unread > 99 ? '99+' : unread}
                    </Box>
                  )}
                </Box>
                <Typography
                  variant="labelMedium"
                  sx={{ fontWeight: current ? 700 : 500, lineHeight: 1.2 }}
                >
                  {label}
                </Typography>
              </Box>
            </li>
          )
        })}
      </Box>
    </Box>
  )
}
