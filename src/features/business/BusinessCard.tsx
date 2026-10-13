import { Box, Button, LinearProgress, Stack, Typography, useTheme } from '@mui/material'
import { ArrowRight, Check, Clock3, MapPin, Pencil, Store } from 'lucide-react'
import { useBusiness, usePreferences } from '../../state/hooks'
import { copy } from '../../design/copy'
import { layout } from '../../design/theme'

export function BusinessCard({
  onEdit,
  onExample,
  onReview,
}: {
  onEdit: () => void
  onExample: () => void
  onReview: () => void
}) {
  const { fields, revision, reviewedRevision } = useBusiness()
  const { language } = usePreferences()
  const t = copy[language]
  const theme = useTheme()
  const roles = theme.material
  const count = Object.values(fields).filter((value) => value.trim()).length
  const reviewed = reviewedRevision === revision
  return (
    <Box
      component="section"
      aria-label={t.business}
      sx={{
        bgcolor: roles.surfaceContainerLow,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '24px',
        p: layout.cardPadding,
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          mb: 4,
          flexWrap: 'wrap',
        }}
      >
        <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
          <Store size={18} aria-hidden="true" />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {t.business}
          </Typography>
        </Stack>
        <Stack
          direction="row"
          sx={{ gap: 1, alignItems: 'center', color: reviewed ? 'primary.main' : 'text.secondary' }}
        >
          {reviewed && <Check size={16} aria-hidden="true" />}
          <Typography variant="body2">{reviewed ? t.reviewed : t.private}</Typography>
        </Stack>
      </Stack>
      <Stack direction="row" sx={{ gap: 3, alignItems: 'center' }}>
        {!fields.name && (
          <Box
            aria-hidden="true"
            sx={{
              color: roles.primary,
              bgcolor: roles.primaryContainer,
              width: 48,
              height: 48,
              borderRadius: '16px',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <Store size={26} strokeWidth={1.3} />
          </Box>
        )}
        <Typography component="h2" variant="h2" sx={{ overflowWrap: 'anywhere' }}>
          {fields.name || t.cardTitle}
        </Typography>
      </Stack>
      <Typography
        variant={fields.name ? 'body1' : 'body2'}
        color="text.secondary"
        sx={{ mt: 2, mb: 4 }}
      >
        {fields.category || t.empty}
      </Typography>
      {fields.name && (
        <Stack sx={{ gap: 3, mb: 6 }}>
          <Stack direction="row" sx={{ gap: 3, alignItems: 'flex-start' }}>
            <MapPin size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
            <Box>
              <Typography variant="body2" color="text.secondary">
                {t.location}
              </Typography>
              <Typography sx={{ overflowWrap: 'anywhere' }}>
                {fields.location || t.missing}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" sx={{ gap: 3, alignItems: 'flex-start' }}>
            <Clock3 size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
            <Box>
              <Typography variant="body2" color="text.secondary">
                {t.hours}
              </Typography>
              <Typography sx={{ overflowWrap: 'anywhere' }}>{fields.hours || t.missing}</Typography>
            </Box>
          </Stack>
        </Stack>
      )}
      {fields.name && (
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="body2">{t.progress}</Typography>
            <Typography variant="body2">{count} / 5</Typography>
          </Stack>
          <LinearProgress
            aria-label={t.progress}
            variant="determinate"
            value={count * 20}
            sx={{ height: 4, borderRadius: 2, bgcolor: roles.surfaceContainerHigh }}
          />
        </Box>
      )}
      <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={onEdit}>
          {t.edit}
        </Button>
        {fields.name ? (
          <Button
            variant="contained"
            disabled={!fields.location.trim()}
            endIcon={<ArrowRight size={16} />}
            onClick={onReview}
          >
            {t.review}
          </Button>
        ) : (
          <Button endIcon={<ArrowRight size={16} />} onClick={onExample}>
            {t.example}
          </Button>
        )}
      </Stack>
    </Box>
  )
}
