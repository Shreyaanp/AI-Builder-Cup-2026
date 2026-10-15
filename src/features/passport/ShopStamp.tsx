import { useEffect, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { Stamp } from 'lucide-react'
import { usePassportCopy } from './copy'
import { StampMoment } from './StampMoment'
import { demoKey } from './store'

/**
 * The passport on a shop page. A scan of the shop's QR (`?source=qr&k=…`) opens the stamp
 * moment once; demo shops offer their on-screen QR as a button, since nobody can stand in a
 * fictional shop.
 */
export function ShopStamp({
  shop,
}: {
  shop: { id: string; name: string; category?: string; demo?: boolean }
}) {
  const t = usePassportCopy()
  const [scan] = useState(() => {
    const params = new URLSearchParams(location.search)
    return params.get('source') === 'qr' ? (params.get('k') ?? '') : null
  })
  const [key, setKey] = useState(scan ?? '')
  const [open, setOpen] = useState(scan !== null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (scan === null) return
    // After the shop card has counted the visit: a reload must not stamp again.
    const timer = setTimeout(() => {
      const url = new URL(location.href)
      url.searchParams.delete('source')
      url.searchParams.delete('k')
      history.replaceState(history.state, '', url)
    }, 0)
    return () => clearTimeout(timer)
  }, [scan])
  async function tryDemo() {
    setBusy(true)
    try {
      setKey(await demoKey(shop.id))
      setOpen(true)
    } catch {
      /* The shop page still works; the button stays. */
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {shop.demo && (
        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<Stamp size={18} />}
            disabled={busy}
            onClick={() => void tryDemo()}
          >
            {t.tryDemo}
          </Button>
          <Typography variant="bodySmall" color="text.secondary" sx={{ mt: 1 }}>
            {t.tryDemoNote}
          </Typography>
        </Box>
      )}
      {open && <StampMoment shop={shop} qrKey={key} open={open} onClose={() => setOpen(false)} />}
    </>
  )
}
