import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Rating,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import { Star } from 'lucide-react'
import type { TipList } from './types'
import { useCustomer } from './account'
import { accountCopy as t, timeAgo } from './copy'
import { SignInButton } from './SignIn'
import './customer.css'

/** Short neighbour tips and ratings: anyone reads, signed-in customers write; moderated. */
export function Tips({ shop }: { shop: string }) {
  const roles = useTheme().material
  const account = useCustomer()
  const [list, setList] = useState<TipList | null>(null)
  const [text, setText] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const path = `/api/v1/public/shops/${encodeURIComponent(shop)}/tips`
  const load = useCallback(
    () =>
      account
        .api<TipList>(path)
        .then(setList)
        .catch(() => setList({ tips: [] })),
    // Reload when the viewer changes so "mine" stays accurate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, account.status],
  )
  useEffect(() => {
    void load()
  }, [load])

  async function post() {
    if (busy || text.trim().length < 3) return
    setBusy(true)
    setNotice(null)
    try {
      await account.api(`/api/v1/customer/shops/${encodeURIComponent(shop)}/tips`, {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), rating }),
      })
      setText('')
      setRating(null)
      setNotice({ kind: 'success', text: t.tipPosted })
      await load()
    } catch (error) {
      const status = error instanceof Error ? error.message : ''
      setNotice({ kind: 'error', text: status === '503' ? t.tipUnavailable : t.tipRejected })
    } finally {
      setBusy(false)
    }
  }

  const tips = list?.tips ?? []
  const mine = tips.some((tip) => tip.mine)
  return (
    <Box component="section" aria-labelledby="tips-title" sx={{ mt: 5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
        <Typography id="tips-title" component="h2" variant="titleLarge" sx={{ flex: 1 }}>
          {t.tipsTitle}
        </Typography>
        {list?.average != null && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Star size={16} fill="currentColor" aria-hidden="true" />
            <Typography variant="labelLarge">
              {t.average
                .replace('{rating}', String(list.average))
                .replace('{count}', t.tipCount(tips.length))}
            </Typography>
          </Stack>
        )}
      </Stack>
      {list && tips.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {t.tipsEmpty}
        </Typography>
      )}
      <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0, mt: 2 }}>
        {tips.map((tip, index) => (
          <Stack
            component="li"
            key={tip.id}
            direction="row"
            spacing={1.5}
            className="c-rise"
            style={{ ['--i' as string]: index }}
            sx={{ p: 2, borderRadius: '20px', bgcolor: roles.surfaceContainerLow }}
          >
            <Avatar
              aria-hidden="true"
              sx={{
                width: 36,
                height: 36,
                fontSize: 15,
                bgcolor: tip.mine ? roles.primary : roles.secondaryContainer,
                color: tip.mine ? roles.onPrimary : roles.onSecondaryContainer,
              }}
            >
              {tip.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="labelLarge">{tip.name}</Typography>
                {tip.rating != null && (
                  <Rating
                    value={tip.rating}
                    readOnly
                    size="small"
                    aria-label={t.stars(tip.rating)}
                  />
                )}
                <Typography variant="labelSmall" color="text.secondary">
                  {timeAgo(tip.created)}
                </Typography>
                {tip.demo && (
                  <Chip
                    label={t.demoTip}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 11,
                      bgcolor: roles.tertiaryContainer,
                      color: roles.onTertiaryContainer,
                    }}
                  />
                )}
              </Stack>
              <Typography variant="bodyMedium" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                {tip.text}
              </Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
      {account.status === 'signed-in' ? (
        <Stack
          component="form"
          noValidate
          spacing={1.5}
          sx={{ mt: 2 }}
          onSubmit={(event) => {
            event.preventDefault()
            void post()
          }}
        >
          <TextField
            label={t.tipLabel}
            placeholder={t.tipPlaceholder}
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 280))}
            multiline
            minRows={2}
            helperText={`${t.moderated} ${Array.from(text).length}/280`}
          />
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography variant="labelLarge" id="tip-rating">
              {t.rating}
            </Typography>
            <Rating
              value={rating}
              onChange={(_, value) => setRating(value)}
              aria-labelledby="tip-rating"
            />
            <Box sx={{ flex: 1 }} />
            <Button
              type="submit"
              variant="contained"
              disabled={busy || text.trim().length < 3}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {t.postTip}
            </Button>
          </Stack>
          {mine && (
            <Button
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                await account
                  .api(`/api/v1/customer/shops/${encodeURIComponent(shop)}/tips`, {
                    method: 'DELETE',
                  })
                  .catch(() => undefined)
                await load()
              }}
            >
              {t.removeTip}
            </Button>
          )}
        </Stack>
      ) : (
        account.status === 'signed-out' && (
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            <Typography variant="bodyMedium" color="text.secondary">
              {t.signInTips}
            </Typography>
            <SignInButton fullWidth={false} />
          </Stack>
        )
      )}
      <Box role="status" sx={{ mt: notice ? 1.5 : 0 }}>
        {notice && <Alert severity={notice.kind}>{notice.text}</Alert>}
      </Box>
    </Box>
  )
}
