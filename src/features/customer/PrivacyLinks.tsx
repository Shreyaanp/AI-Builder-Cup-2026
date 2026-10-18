import { useState } from 'react'
import { Button, Stack, Typography } from '@mui/material'
import { LegalDialog, type LegalDocument } from '../v1/LegalDialog'
import { useCopy } from '../v1/strings'
import { useGuestCopy } from './guestCopy'
import { usePacingCopy } from './pacingCopy'

/** Legal reading has its own full phone page; returning preserves the calling flow. */
export function PrivacyLinks() {
  const [document, setDocument] = useState<LegalDocument>(null)
  const t = useCopy()
  const guest = useGuestCopy()
  const pacing = usePacingCopy()
  return (
    <>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <Button onClick={() => setDocument('terms')} sx={{ minHeight: 48 }}>
          {t.viewTerms}
        </Button>
        <Button onClick={() => setDocument('privacy')} sx={{ minHeight: 48 }}>
          {t.viewPrivacy}
        </Button>
      </Stack>
      <LegalDialog
        open={document}
        onClose={() => setDocument(null)}
        actionLabel={pacing.agree}
        introduction={
          document === 'privacy' ? (
            <Typography variant="bodyLarge">{guest.privacy}</Typography>
          ) : undefined
        }
      />
    </>
  )
}
