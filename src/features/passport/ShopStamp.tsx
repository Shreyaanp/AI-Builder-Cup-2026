import { useEffect, useState } from 'react'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { Stamp } from 'lucide-react'
import { usePassportCopy } from './copy'
import { holdAt } from '../rescue/holds'
import { StampMoment } from './StampMoment'
import { demoKey } from './store'
import { landStamp } from '../rewards/storage'
import { track } from '../../app/analytics'

/**
 * The passport on a shop page. A scan of the shop's QR (`?source=qr&k=…`) arms one primary
 * action in the thumb zone, "Collect your stamp"; the stamp moment opens only on that tap, so
 * the location prompt has a reason and a reload never stamps by itself. Demo shops also offer
 * their on-screen QR as a button, since nobody can stand in a fictional shop.
 */
export function ShopStamp({
  shop,
  armed = false,
  onSpent,
  onChat,
  chatLabel = '',
}: {
  shop: {
    id: string
    name: string
    category?: string
    demo?: boolean
    timezone?: string
    needed?: number
  }
  /** Arrived from the counter QR and not collected yet: show the bottom "Collect" bar. */
  armed?: boolean
  /** The moment was closed: the page returns to its usual bottom bar. */
  onSpent?: () => void
  onChat?: () => void
  chatLabel?: string
}) {
  const t = usePassportCopy()
  const roles = useTheme().material
  const [scan] = useState(() => {
    const params = new URLSearchParams(location.search)
    const key = params.get('k')
    return params.get('source') === 'qr' ? (key ?? '') : null
  })
  const [key, setKey] = useState(scan ?? '')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (scan !== null) track('qr_scanned')
  }, [scan])
  async function collect(qr: boolean) {
    setBusy(true)
    try {
      setKey(scan || (await demoKey(shop.id)))
      if (qr) {
        // The moment is a sheet with its own history entry: open it on the cleaned address, so
        // closing it never lands back on a link with the spent key.
        const url = new URL(location.href)
        url.searchParams.delete('source')
        url.searchParams.delete('k')
        history.replaceState(history.state, '', url)
      }
      setOpen(true)
    } catch {
      /* The shop page still works; the button stays. */
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {armed && !open && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            px: 4,
            pt: 3,
            pb: 'calc(8px + env(safe-area-inset-bottom))',
            bgcolor: roles.surfaceContainer,
            borderTop: `1px solid ${roles.outlineVariant}`,
            zIndex: 2,
          }}
        >
          <Stack spacing={2} sx={{ maxWidth: 720, mx: 'auto' }}>
            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={<Stamp size={20} />}
              disabled={busy}
              onClick={() => void collect(true)}
              sx={{ minHeight: 52 }}
            >
              {t.collect}
            </Button>
            <Button fullWidth onClick={onChat} sx={{ minHeight: 48 }}>
              {chatLabel}
            </Button>
          </Stack>
        </Box>
      )}
      {shop.demo && scan === null && (
        <Box sx={{ mt: 2 }}>
          {/* Outlined: the shop page's one filled button is the chat bar. */}
          <Button
            variant="outlined"
            startIcon={<Stamp size={18} />}
            disabled={busy}
            onClick={() => void collect(false)}
          >
            {t.tryDemo}
          </Button>
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
            {t.tryDemoNote}
          </Typography>
        </Box>
      )}
      {open && (
        <StampMoment
          shop={shop}
          qrKey={key}
          open={open}
          onClose={(stamped, answered) => {
            setOpen(false)
            // A shop's answer (stamped, already today, too far…) ends the QR prompt; a closed
            // spinner or a failed request leaves "Collect your stamp" to try again.
            if (answered) onSpent?.()
            if (stamped) {
              landStamp(shop.id)
              track('stamp_added')
            }
          }}
          // A scan where this phone holds a rescue collects it (checked against the shop chat).
          rescue={holdAt(shop.id)?.rescue ?? null}
        />
      )}
    </>
  )
}
