import { useId, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { Info } from 'lucide-react'
import { useLocale } from '../../state/hooks'
import { aiInfoCopy, type AiFeature } from './aiInfoCopy'
import { Sheet } from './Sheet'

/** Contextual help in normal flow; inside an existing sheet, reveal the sentence there. */
export function AiInfo({ feature, inSheet = false }: { feature: AiFeature; inSheet?: boolean }) {
  const t = aiInfoCopy(useLocale())
  const [open, setOpen] = useState(false)
  const id = useId()
  const sentence = <Typography variant="bodyLarge">{t[feature]}</Typography>
  return (
    <Box data-testid="ai-info" data-feature={feature} sx={{ minWidth: 0 }}>
      <Button
        variant="text"
        startIcon={<Info aria-hidden="true" />}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup={inSheet ? undefined : 'dialog'}
        onClick={() => setOpen((value) => !value)}
        sx={{
          minHeight: 48,
          maxWidth: '100%',
          typography: 'bodyLarge',
          color: 'text.secondary',
          textAlign: 'start',
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
        }}
      >
        {t.label}
      </Button>
      {inSheet ? (
        open && <Box id={id}>{sentence}</Box>
      ) : (
        <Sheet open={open} onClose={() => setOpen(false)} titleId={id} title={t.label}>
          {sentence}
        </Sheet>
      )}
    </Box>
  )
}
