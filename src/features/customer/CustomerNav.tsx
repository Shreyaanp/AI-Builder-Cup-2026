import { useLayoutEffect, useRef } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import { Bookmark, Leaf, MessageCircle, Sparkles, Stamp } from 'lucide-react'
import { customerNavigate } from '../frontdoors/navigation'
import { useCustomer } from './account'
import { useAccountCopy } from './copy'
import { usePassportCopy } from '../passport/copy'
import { useRescueCopy } from '../rescue/copy'
import './customer.css'

export type CustomerTab = 'ask' | 'rescue' | 'passport' | 'chats' | 'saved'

const tabs: { id: CustomerTab; href: string; Icon: typeof Sparkles }[] = [
  { id: 'ask', href: '/explore/', Icon: Sparkles },
  { id: 'rescue', href: '/explore/rescue', Icon: Leaf },
  { id: 'passport', href: '/explore/passport', Icon: Stamp },
  { id: 'chats', href: '/explore/chats', Icon: MessageCircle },
  { id: 'saved', href: '/explore/saved', Icon: Bookmark },
]

/**
 * The theme's 14px label size, stepping down only when a long word (Tamil, Kannada, Malay…) would
 * not fit its fifth of the bar: 12px next, and last a size that scales with the screen. A word
 * never splits mid-syllable and the bar never shows a 9-11px size where 14px fits (A-22).
 */
const NAV_SIZES = ['', '12px', 'min(12px, 2.9vw)']
function NavLabel({ current, children }: { current: boolean; children: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      for (const size of NAV_SIZES) {
        el.style.fontSize = size
        if (el.scrollWidth <= el.clientWidth + 1) break
      }
    }
    fit()
    // A web font that arrives late, or a turned phone, changes the width.
    void document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [children])
  return (
    <Typography
      ref={ref}
      variant="labelMedium"
      sx={{
        maxWidth: '100%',
        fontWeight: current ? 700 : 500,
        lineHeight: 1.15,
        letterSpacing: 0,
        textAlign: 'center',
        overflowWrap: 'normal',
        wordBreak: 'keep-all',
        hyphens: 'none',
      }}
    >
      {children}
    </Typography>
  )
}

/** M3 navigation bar: the top-level customer destinations, unread badge on Chats. */
export function CustomerNav({ active }: { active: CustomerTab }) {
  const roles = useTheme().material
  const { unread } = useCustomer()
  const t = useAccountCopy()
  const passport = usePassportCopy()
  const rescue = useRescueCopy()
  return (
    <Box
      component="nav"
      aria-label={t.nav}
      className="c-nav"
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
          const label = id === 'passport' ? passport.nav : id === 'rescue' ? rescue.nav : t[id]
          const current = id === active
          const badge = id === 'chats' && unread > 0
          return (
            <li key={id} style={{ display: 'flex', minWidth: 0 }}>
              <Box
                component="a"
                href={href}
                onClick={customerNavigate}
                aria-current={current ? 'page' : undefined}
                aria-label={badge ? `${label}, ${t.unread(unread)}` : undefined}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
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
                        px: 1,
                        borderRadius: 999,
                        bgcolor: roles.error,
                        color: roles.onError,
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {unread > 99 ? '99+' : unread}
                    </Box>
                  )}
                </Box>
                {/* Several words (Hindi "सहेजे गए") wrap to two lines rather than run together. */}
                <NavLabel current={current}>{label}</NavLabel>
              </Box>
            </li>
          )
        })}
      </Box>
    </Box>
  )
}
