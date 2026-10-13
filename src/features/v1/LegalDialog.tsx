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
import { LEGAL_VERSION, PRIVACY, TERMS } from './legal'
import { useCopy } from './strings'
import { windowClass } from '../../design/theme'

export type LegalDocument = 'terms' | 'privacy' | null

export function LegalDialog({ open, onClose }: { open: LegalDocument; onClose: () => void }) {
  const t = useCopy()
  const compact = useMediaQuery(`(max-width:${windowClass.medium - 1}px)`)
  const sections = open === 'privacy' ? PRIVACY : TERMS
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
          <Alert severity="warning">
            {t.draftLegal} · v{LEGAL_VERSION}
          </Alert>
          {sections.map((section) => (
            <Box key={section.heading} lang="en">
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
          {t.close}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
