import { Box, Chip, Rating, Stack, Typography, useTheme } from '@mui/material'
import { Star } from 'lucide-react'
import type { TipList } from '../customer/types'
import { accountCopy as t, timeAgo } from '../customer/copy'

/** Neighbour tips about this shop, read-only for the owner under Messages. */
export function OwnerTips({ list }: { list: TipList | null }) {
  const roles = useTheme().material
  if (!list || list.tips.length === 0) return null
  return (
    <Box component="section" aria-labelledby="owner-tips-title" sx={{ mt: 4 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
        <Typography id="owner-tips-title" component="h3" variant="titleMedium" sx={{ flex: 1 }}>
          {t.tipsTitle}
        </Typography>
        {list.average != null && (
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Star size={16} fill="currentColor" aria-hidden="true" />
            <Typography variant="labelLarge">
              {t.average
                .replace('{rating}', String(list.average))
                .replace('{count}', t.tipCount(list.tips.length))}
            </Typography>
          </Stack>
        )}
      </Stack>
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0, mt: 1.5 }}>
        {list.tips.map((tip) => (
          <Box
            component="li"
            key={tip.id}
            sx={{ p: 2, borderRadius: '16px', bgcolor: roles.surfaceContainerLow }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="labelLarge">{tip.name}</Typography>
              {tip.rating != null && (
                <Rating value={tip.rating} readOnly size="small" aria-label={t.stars(tip.rating)} />
              )}
              <Typography variant="labelSmall" color="text.secondary">
                {timeAgo(tip.created)}
              </Typography>
              {tip.demo && (
                <Chip label={t.demoTip} size="small" sx={{ height: 20, fontSize: 11 }} />
              )}
            </Stack>
            <Typography variant="bodyMedium" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
              {tip.text}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  )
}
