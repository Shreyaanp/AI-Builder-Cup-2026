import { useId, useState } from 'react'
import { Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material'
import { Languages, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { useIdentity } from '../../auth/useIdentity'
import { Sheet } from './Sheet'
import { useCopy } from './strings'

/** Quiet reassurance; details stay one tap away and support requires a configured link. */
export function TrustStrip() {
  const { trustStrip } = useIdentity()
  const t = useCopy()
  const roles = useTheme().material
  const titleId = useId()
  const [selected, setSelected] = useState<number | null>(null)
  if (!trustStrip?.enabled) return null
  const items = [
    { label: t.trustFree, body: t.trustFreeBody, icon: <Sparkles size={18} aria-hidden="true" /> },
    {
      label: t.trustLanguage,
      body: t.trustLanguageBody,
      icon: <Languages size={18} aria-hidden="true" />,
    },
    {
      label: t.trustData,
      body: t.trustDataBody,
      icon: <ShieldCheck size={18} aria-hidden="true" />,
    },
    ...(trustStrip.supportWhatsapp
      ? [
          {
            label: t.trustHuman,
            body: t.trustHumanBody,
            icon: <MessageCircle size={18} aria-hidden="true" />,
          },
        ]
      : []),
  ]
  const active = selected === null ? undefined : items[selected]
  return (
    <Box data-testid="trust-strip">
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        {items.map((item, index) => (
          <Chip
            key={item.label}
            component="button"
            type="button"
            variant="outlined"
            label={item.label}
            icon={item.icon}
            onClick={() => setSelected(index)}
            aria-haspopup="dialog"
            sx={{
              minHeight: 48,
              height: 'auto',
              maxWidth: '100%',
              color: roles.onSurfaceVariant,
              borderColor: roles.outlineVariant,
              '& .MuiChip-label': { whiteSpace: 'normal', py: 1 },
              '& .MuiChip-icon': { color: roles.primary },
            }}
          />
        ))}
      </Stack>
      <Sheet
        open={!!active}
        onClose={() => setSelected(null)}
        titleId={titleId}
        title={active?.label}
      >
        <Typography variant="bodyMedium">{active?.body}</Typography>
        {selected === 3 && trustStrip.supportWhatsapp && (
          <Button
            component="a"
            href={trustStrip.supportWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ mt: 2 }}
          >
            {t.trustWhatsapp}
          </Button>
        )}
      </Sheet>
    </Box>
  )
}
