import { useState } from 'react'
import { Alert, Box, Button, Chip, IconButton, Stack, Typography, useTheme } from '@mui/material'
import { Check, Leaf, MessageCircle, Minus, Plus } from 'lucide-react'
import { popIn } from '../../design/chalkMotion'
import { useLocale } from '../../state/hooks'
import { useCustomer } from '../customer/account'
import { SignInButton } from '../customer/SignIn'
import { chatPath, go } from '../customer/paths'
import type { ChatSummary } from '../customer/types'
import { fill } from '../passport/copy'
import { Sheet } from '../v1/Sheet'
import { useRescueCopy } from './copy'
import { clock, keepHold } from './holds'
import type { Deal, PublicRescue } from './holds'

// At most a few portions per person, so one neighbour cannot take a whole rescue.
const MAX_PER_HOLD = 5

/**
 * "Hold one for me": the templated message goes to the shop in the customer's own chat, then
 * the hold is recorded against that chat (the server caps portions atomically). No payment.
 * Signed out, the same sheet asks for sign-in first (one sheet, so Back closes one thing).
 */
export function HoldSheet({
  row,
  onClose,
  onChanged,
  onGone,
}: {
  row: PublicRescue
  onClose: () => void
  onChanged: (deal: Deal) => void
  onGone: () => void
}) {
  const t = useRescueCopy()
  const locale = useLocale()
  const theme = useTheme()
  const roles = theme.material
  const coral = theme.chalk.coral
  const { api, status } = useCustomer()
  const signedIn = status === 'signed-in'
  const items = row.deal.items.filter((item) => item.qty_left > 0)
  const [name, setName] = useState(items[0]?.name ?? '')
  const [qty, setQty] = useState(1)
  const [phase, setPhase] = useState<'ask' | 'sending' | 'held' | 'gone' | 'failed'>('ask')
  const [thread, setThread] = useState('')
  const item = items.find((i) => i.name === name) ?? items[0]
  const most = Math.min(MAX_PER_HOLD, item?.qty_left ?? 1)
  const shop = row.shop_name.replace(/\s*\(Demo\)$/, '')
  const until = clock(row.deal.ends, locale)
  const message = fill(t.holdMessage, { qty, item: item?.name ?? '', time: until })

  async function send() {
    if (!item) return
    setPhase('sending')
    const base = `/api/v1/customer/shops/${encodeURIComponent(row.shop_id)}`
    try {
      // The customer's own words first (one thread per shop: it continues an earlier chat).
      const chat = await api<ChatSummary>(`${base}/threads`, {
        method: 'POST',
        body: JSON.stringify({ text: message, language: locale, instant_answer: false }),
      })
      const deal = await api<Deal>(`${base}/rescue/${encodeURIComponent(row.deal.id)}/hold`, {
        method: 'POST',
        body: JSON.stringify({ thread_id: chat.thread.id, name: item.name, qty }),
      })
      keepHold({
        rescue: row.deal.id,
        shop: row.shop_id,
        shopName: shop,
        item: item.name,
        qty,
        ends: row.deal.ends,
        thread: chat.thread.id,
        demo: row.deal.demo,
      })
      setThread(chat.thread.id)
      onChanged(deal)
      navigator.vibrate?.(20)
      setPhase('held')
    } catch (failure) {
      if (failure instanceof Error && failure.message === '409') {
        setPhase('gone')
        onGone()
      } else setPhase('failed')
    }
  }

  const held = phase === 'held'
  return (
    <Sheet
      open
      onClose={onClose}
      titleId="rescue-hold-title"
      title={held ? t.rescued : signedIn ? t.holdTitle : t.signInTitle}
      dismissInActions
      actions={
        !signedIn ? (
          <Button onClick={onClose}>{t.cancel}</Button>
        ) : held ? (
          <>
            <Button onClick={onClose}>{t.done}</Button>
            <Button
              variant="contained"
              startIcon={<MessageCircle size={18} />}
              onClick={() => go(chatPath(row.shop_id, thread))}
            >
              {t.openChat}
            </Button>
          </>
        ) : phase === 'gone' ? (
          <Button variant="contained" onClick={onClose}>
            {t.done}
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t.cancel}</Button>
            <Button
              variant="contained"
              startIcon={<Leaf size={18} />}
              disabled={phase === 'sending' || !item}
              onClick={() => void send()}
              sx={{
                bgcolor: coral.main,
                color: coral.onMain,
                '&:hover': { bgcolor: coral.main },
              }}
            >
              {t.send}
            </Button>
          </>
        )
      }
    >
      {!signedIn ? (
        <Stack spacing={3}>
          <Typography variant="bodyLarge">{t.signInBody}</Typography>
          <SignInButton />
        </Stack>
      ) : held ? (
        <Stack spacing={3} sx={{ alignItems: 'flex-start' }} aria-live="polite">
          <Box
            aria-hidden="true"
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: coral.container,
              color: coral.onContainer,
              ...popIn,
            }}
          >
            <Check size={32} />
          </Box>
          <Typography component="p" variant="titleMedium">
            {fill(t.portions, { n: qty, item: item?.name ?? '' })} · {shop}
          </Typography>
          <Typography variant="bodyLarge">{fill(t.heldUntil, { time: until })}</Typography>
          <Typography variant="bodyMedium" sx={{ color: roles.onSurfaceVariant }}>
            {t.collectHint}
          </Typography>
        </Stack>
      ) : phase === 'gone' ? (
        <Typography variant="bodyLarge" aria-live="polite">
          {t.gone}
        </Typography>
      ) : (
        <Stack spacing={4}>
          <Typography variant="bodyMedium" sx={{ color: roles.onSurfaceVariant }}>
            {fill(t.holdBody, { shop })}
          </Typography>
          {items.length > 1 && (
            <Box role="group" aria-labelledby="rescue-hold-item">
              <Typography id="rescue-hold-item" variant="labelLarge" sx={{ mb: 1 }}>
                {t.whichItem}
              </Typography>
              <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                {items.map((choice) => (
                  <Chip
                    key={choice.name}
                    label={choice.name}
                    clickable
                    aria-pressed={choice.name === item?.name}
                    color={choice.name === item?.name ? 'primary' : 'default'}
                    onClick={() => {
                      setName(choice.name)
                      setQty(1)
                    }}
                    sx={{ minHeight: 40 }}
                  />
                ))}
              </Stack>
            </Box>
          )}
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
            <Typography id="rescue-hold-qty" variant="labelLarge" sx={{ flex: 1 }}>
              {t.howMany}
            </Typography>
            <IconButton
              aria-label={t.fewer}
              disabled={qty <= 1}
              onClick={() => setQty((n) => Math.max(1, n - 1))}
            >
              <Minus size={20} />
            </IconButton>
            <Typography
              role="status"
              aria-labelledby="rescue-hold-qty"
              component="p"
              variant="titleLarge"
              sx={{ minWidth: 32, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
            >
              {qty}
            </Typography>
            <IconButton
              aria-label={t.more}
              disabled={qty >= most}
              onClick={() => setQty((n) => Math.min(most, n + 1))}
            >
              <Plus size={20} />
            </IconButton>
          </Stack>
          {/* The exact message the shop will see, as a chat bubble. */}
          <Box
            sx={{
              alignSelf: 'flex-end',
              maxWidth: '88%',
              px: 3,
              py: 2,
              borderRadius: '18px 18px 4px 18px',
              bgcolor: theme.chalk.sky.container,
              color: theme.chalk.sky.onContainer,
            }}
          >
            <Typography variant="bodyLarge">{message}</Typography>
          </Box>
          {phase === 'failed' && <Alert severity="error">{t.holdFailed}</Alert>}
        </Stack>
      )}
    </Sheet>
  )
}
