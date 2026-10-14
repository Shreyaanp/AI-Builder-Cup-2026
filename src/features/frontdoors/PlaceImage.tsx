import { useState } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import { useFrontCopy } from './strings'
import { categoryArt, ownerApprovedPhoto } from './photos'

export function PlaceImage({
  id,
  category,
  photo,
  authors = [],
  eager = false,
  transition = false,
  compact = false,
}: {
  id: string
  category: string
  photo?: string | null
  authors?: string[]
  eager?: boolean
  transition?: boolean
  /** Square thumbnail without the caption (credits move to the tooltip). */
  compact?: boolean
}) {
  const roles = useTheme().material
  const t = useFrontCopy()
  const [failed, setFailed] = useState<string | null>(null)
  // Only same-origin vetted endpoints; third-party photo media always travels through the server.
  const approved = ownerApprovedPhoto(id)
  const source = approved ?? (photo?.startsWith('/api/v1/place-photo?') ? photo : undefined)
  const actual = source && failed !== source ? source : undefined
  return (
    <Box
      title={compact && actual ? authors.join(' · ') : undefined}
      sx={{
        position: 'relative',
        height: compact ? '100%' : undefined,
        bgcolor: roles.secondaryContainer,
        color: roles.onSecondaryContainer,
      }}
    >
      <Box
        component="img"
        src={actual ?? categoryArt(category)}
        width={800}
        height={600}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        decoding="async"
        onError={() => {
          if (actual) setFailed(actual)
        }}
        sx={{
          width: '100%',
          height: compact ? '100%' : 'auto',
          aspectRatio: compact ? '1/1' : '4/3',
          objectFit: 'cover',
          display: 'block',
          viewTransitionName: transition ? `shop-${id.replace(/[^a-zA-Z0-9-]/g, '')}` : undefined,
        }}
      />
      {!compact && (
        <Typography
          variant="labelMedium"
          sx={{ p: 2, bgcolor: roles.surfaceContainer, color: roles.onSurface }}
        >
          {actual ? authors.join(' · ') : t.art}
        </Typography>
      )}
    </Box>
  )
}
