import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { LEGAL_VERSION, LEGAL } from './legal'
import { useBackClose } from './backStack'
import { useCopy } from './strings'
import { useLocale } from '../../state/hooks'
import { windowClass } from '../../design/theme'
import type { ReactNode } from 'react'

export type LegalDocument = 'terms' | 'privacy' | null

export function LegalDialog({
  open,
  onClose,
  introduction,
  actionLabel,
}: {
  open: LegalDocument
  onClose: () => void
  introduction?: ReactNode
  actionLabel?: string
}) {
  const t = useCopy()
  const locale = useLocale()
  const compact = useMediaQuery(`(max-width:${windowClass.medium - 1}px)`)
  const document = LEGAL[locale] ?? LEGAL.en!
  const sections = open === 'privacy' ? document.PRIVACY : document.TERMS
  useBackClose(open !== null, onClose)
  return (
    <Dialog
      open={open !== null}
      onClose={onClose}
      fullScreen={compact}
      scroll="paper"
      aria-labelledby="legal-title"
    >
      <DialogTitle id="legal-title">{open === 'privacy' ? t.viewPrivacy : t.viewTerms}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          {introduction}
          <Alert severity="warning">
            {t.draftLegal} · v{LEGAL_VERSION}
          </Alert>
          {locale !== 'en' && <Typography variant="bodyMedium">{t.legalTranslation}</Typography>}
          {sections.map((section) => (
            <Box key={section.heading} lang={LEGAL[locale] ? locale : 'en'}>
              <Typography component="h3" variant="titleMedium" sx={{ mb: 1 }}>
                {section.heading}
              </Typography>
              {section.body.map((paragraph) => (
                <Typography
                  key={paragraph}
                  variant="bodyMedium"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  {paragraph}
                </Typography>
              ))}
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" onClick={onClose}>
          {actionLabel ?? t.close}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
