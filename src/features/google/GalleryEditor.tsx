import { useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Camera, ImagePlus, X } from 'lucide-react'
import { shape } from '../../design/theme'
import { fill, useGoogleCopy } from './strings'
import { GALLERY_KINDS, galleryGroupCopy as groups, type GalleryKind } from './galleryGroups'
import { GALLERY_LIMIT, type useGallery } from './useGallery'

const PHOTO_TYPES = 'image/jpeg,image/png,image/webp'
const EASE = 'cubic-bezier(0.2, 0, 0, 1)' // M3 emphasized decelerate
// A new photo pops in; the global reduced-motion rule makes this instant.
const pop = {
  '@keyframes cbPop': {
    '0%': { transform: 'scale(0.4)', opacity: 0 },
    '70%': { transform: 'scale(1.15)', opacity: 1 },
    '100%': { transform: 'scale(1)' },
  },
}

/** The shop's photos: view, add (camera on phones) and remove. Used by the Shop tab's Photos
 * sheet and the Get on Google guide. */
export function GalleryEditor({ gallery }: { gallery: ReturnType<typeof useGallery> }) {
  const g = useGoogleCopy()
  const roles = useTheme().material
  const phone = useMediaQuery('(pointer: coarse)')
  const upload = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<GalleryKind>('storefront')
  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void gallery.add(file, kind)
  }
  return (
    <Stack spacing={3} sx={{ mt: 2, ...pop }}>
      <Typography variant="bodyMedium" color="text.secondary">
        {g.photosTip}
      </Typography>
      {GALLERY_KINDS.map((group) => {
        const members = gallery.ids.filter((id) => gallery.kinds[id] === group)
        if (!members.length) return null
        return (
          <Stack key={group} component="section" spacing={1} aria-label={groups.kinds[group]}>
            <Typography variant="titleSmall" component="h3">
              {groups.kinds[group]} · {members.length}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 2,
              }}
            >
              {members.map((id) => {
                const index = gallery.ids.indexOf(id)
                return (
                  <Stack key={id} spacing={1}>
                    <Box
                      sx={{
                        position: 'relative',
                        aspectRatio: '1 / 1',
                        borderRadius: `${shape.md}px`,
                        overflow: 'hidden',
                        bgcolor: roles.surfaceContainerHigh,
                        animation: `cbPop 360ms ${EASE} both`,
                      }}
                    >
                      {gallery.urls[id] && (
                        <Box
                          component="img"
                          src={gallery.urls[id]}
                          alt=""
                          sx={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      )}
                      <IconButton
                        aria-label={fill(g.removePhoto, { n: index + 1 })}
                        onClick={() => void gallery.remove(id)}
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          bgcolor: 'rgba(0,0,0,0.55)',
                          color: '#fff',
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                        }}
                      >
                        <X size={16} />
                      </IconButton>
                    </Box>
                    {index === 0 ? (
                      <Typography
                        variant="labelLarge"
                        data-testid="cover-photo"
                        sx={{ color: roles.primary, textAlign: 'center' }}
                      >
                        {groups.cover}
                      </Typography>
                    ) : (
                      <Button
                        sx={{ minHeight: 48 }}
                        aria-label={fill(groups.makeCover, { n: index + 1 })}
                        onClick={() => void gallery.makeCover(id)}
                      >
                        {groups.makeCoverLabel}
                      </Button>
                    )}
                  </Stack>
                )
              })}
            </Box>
          </Stack>
        )
      })}
      {gallery.ids.length > 0 && (
        <Typography variant="bodySmall" color="text.secondary">
          {groups.usedNote}
        </Typography>
      )}
      {!gallery.full && (
        <Stack spacing={1} role="radiogroup" aria-label={groups.addTo}>
          <Typography variant="labelLarge" color="text.secondary">
            {groups.addTo}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {GALLERY_KINDS.map((option) => (
              <Button
                key={option}
                role="radio"
                aria-checked={kind === option}
                variant={kind === option ? 'contained' : 'outlined'}
                sx={{ minHeight: 48 }}
                onClick={() => setKind(option)}
              >
                {groups.kinds[option]}
              </Button>
            ))}
          </Stack>
        </Stack>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 2,
        }}
      >
        {!gallery.full && (
          <Box
            component="button"
            type="button"
            onClick={() => upload.current?.click()}
            disabled={gallery.busy}
            aria-label={g.addPhoto}
            sx={{
              all: 'unset',
              cursor: 'pointer',
              aspectRatio: '1 / 1',
              borderRadius: `${shape.md}px`,
              border: `2px dashed ${roles.outlineVariant}`,
              display: 'grid',
              placeItems: 'center',
              color: roles.primary,
              transition: `background-color 200ms ${EASE}`,
              '&:hover': { bgcolor: roles.surfaceContainerLow },
              '&:focus-visible': { outline: `3px solid ${roles.primary}` },
            }}
          >
            {gallery.busy ? <CircularProgress size={24} /> : <ImagePlus size={28} />}
          </Box>
        )}
      </Box>
      <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {phone && !gallery.full && (
          <Button
            variant="outlined"
            startIcon={<Camera size={18} />}
            disabled={gallery.busy}
            onClick={() => camera.current?.click()}
          >
            {g.takePhoto}
          </Button>
        )}
        <Typography variant="bodySmall" color="text.secondary" aria-live="polite">
          {gallery.busy
            ? g.adding
            : fill(g.photosCount, { n: gallery.ids.length, max: GALLERY_LIMIT })}
        </Typography>
      </Stack>
      {gallery.failed && (
        <Alert severity="error" role="alert">
          {g.photoFailed}
        </Alert>
      )}
      <input ref={upload} type="file" accept={PHOTO_TYPES} hidden onChange={pick} />
      <input
        ref={camera}
        type="file"
        accept={PHOTO_TYPES}
        capture="environment"
        hidden
        onChange={pick}
      />
    </Stack>
  )
}
