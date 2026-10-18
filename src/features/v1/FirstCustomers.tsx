import { useId, useState } from 'react'
import { Box, Button, Stack, Typography, useTheme } from '@mui/material'
import { Printer, Share2 } from 'lucide-react'
import { shape } from '../../design/theme'
import { Sheet } from './Sheet'
import { ShopQr } from './ShopQr'
import { useCopy } from './strings'

/** Shared by Today and the post-launch congratulations page. No publishing side effects. */
export function FirstCustomers({ url, name }: { url: string; name: string }) {
  const t = useCopy()
  const roles = useTheme().material
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const message = `${t.shareMessage(name)}\n${url}`
  return (
    <Box
      component="section"
      aria-labelledby={`${titleId}-card`}
      data-testid="first-customers"
      sx={{ p: 3, bgcolor: roles.surfaceContainer, borderRadius: `${shape.lg}px` }}
    >
      <Typography id={`${titleId}-card`} component="h2" variant="titleMedium">
        {t.firstCustomers}
      </Typography>
      <Stack sx={{ mt: 2, gap: 1, alignItems: 'stretch' }}>
        <Button variant="outlined" startIcon={<Printer size={18} />} onClick={() => setOpen(true)}>
          {t.printPoster}
        </Button>
        <Button
          component="a"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<Share2 size={18} />}
        >
          {t.shareWhatsApp}
        </Button>
      </Stack>
      <Sheet open={open} onClose={() => setOpen(false)} titleId={titleId} title={t.printPoster}>
        {open && <ShopQr url={url} name={name} printOnly />}
      </Sheet>
    </Box>
  )
}
